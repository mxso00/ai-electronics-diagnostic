import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeImage, type Effort } from "../core/analyze";
import { DEFAULT_MAX_EDGE, ImageError, prepareImage, type PreparedImage } from "../core/image";
import { API_KEY_ENV, estimateCostUsd, isModelKey, MODELS, type ModelKey, type Provider } from "../core/models";
import { AnalysisGoal, UserLevel } from "../core/report-schema";
import { safetyWarnings } from "../core/safety";
import { loadLabels, type Label } from "./labels";
import { scoreReport } from "./score";
import { renderSummary, type EvalItem } from "./summary";

const HELP = `Uso: npm run eval -- [opciones]

  --models opus,sonnet   Modelos a comparar (opus, sonnet, haiku, gemini, gemini38).
                         Por defecto: opus,sonnet si hay clave de Anthropic; si no, gemini
  --effort high          Esfuerzo de razonamiento: low, medium, high, xhigh, max. Por defecto: high
  --max-edge 2576        Lado máximo de la imagen en píxeles
  --goal auto            Objetivo: auto, identify, damage, explain, documentation
  --level intermediate   Nivel del usuario: beginner, intermediate, expert
  --limit N              Analiza solo las N primeras fotos
  --only archivo.jpg     Analiza solo esa foto
  --concurrency N        Análisis simultáneos. Por defecto: 1 con Gemini, 2 con Claude
  --resume               Continúa la última evaluación: repite solo lo que falló o faltaba
  --dry-run              Valida fotos y etiquetas y estima el coste sin llamar a la IA
`;

const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, "eval", "images");
const LABELS_PATH = path.join(ROOT, "eval", "labels.csv");
const RESULTS_DIR = path.join(ROOT, "eval", "results");
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: se usan las variables de entorno del sistema.
  }

  const { values } = parseArgs({
    options: {
      models: { type: "string" },
      effort: { type: "string", default: "high" },
      "max-edge": { type: "string", default: String(DEFAULT_MAX_EDGE) },
      goal: { type: "string", default: "auto" },
      level: { type: "string", default: "intermediate" },
      limit: { type: "string" },
      only: { type: "string" },
      concurrency: { type: "string" },
      resume: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return void console.log(HELP);

  const previous = values.resume ? await loadPreviousRun() : null;
  // Al continuar se respeta la configuración de la evaluación original.
  const defaultModels = process.env.ANTHROPIC_API_KEY || !process.env.GEMINI_API_KEY ? "opus,sonnet" : "gemini";
  const models = previous?.config.models ?? (values.models ?? defaultModels).split(",").map((m) => m.trim());
  const unknown = models.filter((m) => !isModelKey(m));
  if (unknown.length) fail(`Modelo desconocido: ${unknown.join(", ")}. Usa: ${Object.keys(MODELS).join(", ")}.`);
  const modelKeys = models as ModelKey[];
  if (!EFFORTS.includes(values.effort as Effort)) fail(`Esfuerzo no válido: ${values.effort}.`);
  const effort = (previous?.config.effort ?? values.effort) as Effort;
  const goal = AnalysisGoal.parse(previous?.config.goal ?? values.goal);
  const level = UserLevel.parse(previous?.config.level ?? values.level);
  const maxEdge = previous?.config.maxEdge ?? Number(values["max-edge"]);
  // La capa gratuita de Gemini admite pocas peticiones por minuto.
  const usesGemini = modelKeys.some((m) => MODELS[m].provider === "google");
  const concurrency = Math.max(1, Number(values.concurrency ?? (usesGemini ? 1 : 2)));

  if (!existsSync(LABELS_PATH)) {
    fail("No existe eval/labels.csv. Copia eval/labels.example.csv como eval/labels.csv y rellénalo con tus fotos.");
  }
  let labels: Label[];
  try {
    labels = await loadLabels(LABELS_PATH);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  await reportUnlabeledImages(labels);
  if (values.only) labels = labels.filter((l) => l.file === values.only);
  if (values.limit) labels = labels.slice(0, Number(values.limit));
  if (labels.length === 0) fail("No hay fotos que analizar con esos filtros.");

  console.log(`Preparando ${labels.length} foto(s)…`);
  const images = new Map<string, PreparedImage | ImageError>();
  for (const label of labels) {
    const file = path.join(IMAGES_DIR, label.file);
    if (!existsSync(file)) {
      images.set(label.file, new ImageError(`No se encuentra eval/images/${label.file}.`));
      continue;
    }
    try {
      images.set(label.file, await prepareImage(await readFile(file), maxEdge));
    } catch (error) {
      if (!(error instanceof ImageError)) throw error;
      images.set(label.file, error);
    }
  }
  for (const [file, image] of images) {
    if (image instanceof ImageError) console.warn(`  ⚠ ${file}: ${image.message}`);
  }

  const ready = labels.filter((l) => !(images.get(l.file) instanceof ImageError));
  if (values["dry-run"]) return dryRun(ready, images, modelKeys);

  const providers = new Set(modelKeys.map((m) => MODELS[m].provider));
  const missingKeys = [...providers].map((p) => API_KEY_ENV[p]).filter((name) => !process.env[name]);
  if (missingKeys.length) {
    fail(`Falta ${missingKeys.join(" y ")} en .env. Copia .env.example como .env y pon tu clave.`);
  }

  const startedAt = previous ? new Date(previous.startedAtIso) : new Date();
  const stamp = previous?.dir ?? startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(RESULTS_DIR, stamp);
  await mkdir(outDir, { recursive: true });
  const config = {
    models: modelKeys,
    effort,
    maxEdge,
    goal,
    level,
    startedAt: startedAt.toLocaleString("es-ES"),
    startedAtIso: startedAt.toISOString(),
    // Identificador exacto de cada modelo: el alias «gemini» puede cambiar de modelo con el tiempo.
    modelIds: Object.fromEntries(modelKeys.map((m) => [m, MODELS[m].id])),
  };

  // Al continuar se conservan los análisis correctos (puntuados de nuevo con
  // las etiquetas actuales) y solo se repite lo que falló o faltaba.
  const items: EvalItem[] = [];
  for (const old of previous?.items ?? []) {
    const label = labels.find((l) => l.file === old.file);
    const sameModel = previous?.config.modelIds?.[old.model] === MODELS[old.model]?.id;
    if (!label || !old.result.ok || !modelKeys.includes(old.model) || !sameModel) continue;
    items.push({ ...old, label, score: scoreReport(old.result.report, label) });
  }
  const isDone = (model: ModelKey, file: string) => items.some((i) => i.model === model && i.file === file);
  const tasks = modelKeys.flatMap((model) =>
    labels.filter((label) => !isDone(model, label.file)).map((label) => ({ model, label })),
  );

  // Se guarda tras cada análisis: si se corta o se agota la cuota, no se pierde nada.
  const save = async () => {
    const order = (i: EvalItem) => labels.findIndex((l) => l.file === i.file) * 10 + modelKeys.indexOf(i.model);
    const sorted = [...items].sort((a, b) => order(a) - order(b));
    await writeFile(
      path.join(outDir, "results.json"),
      JSON.stringify(
        {
          config,
          items: sorted.map((i) => ({ ...i, safetyWarnings: i.result.ok ? safetyWarnings(i.result.report) : [] })),
        },
        null,
        2,
      ),
    );
    await writeFile(path.join(outDir, "resumen.md"), renderSummary(config, sorted));
  };

  const discarded = (previous?.items.filter((i) => i.result.ok).length ?? 0) - items.length;
  if (discarded > 0) console.log(`Se repiten ${discarded} análisis anteriores hechos con otro modelo o sin etiqueta.`);
  if (previous)
    console.log(`Continuando eval/results/${stamp}/: ${items.length} análisis ya hechos, ${tasks.length} pendientes.`);
  if (tasks.length === 0) {
    await save();
    return void console.log("No queda nada pendiente. Resumen actualizado con las etiquetas actuales.");
  }

  let done = 0;
  const authFailed = new Set<Provider>();
  // Dos «cuota superada» seguidos en un proveedor: se dejan sus análisis para otro día.
  const quotaHits = new Map<Provider, number>();
  const exhausted = new Set<Provider>();

  console.log(`Analizando: ${tasks.length} análisis pendientes (${modelKeys.join(", ")}), esfuerzo ${effort}…\n`);
  await runPool(tasks, concurrency, async ({ model, label }) => {
    const provider = MODELS[model].provider;
    if (authFailed.has(provider) || exhausted.has(provider)) return;
    const image = images.get(label.file)!;
    let item: EvalItem;
    if (image instanceof ImageError) {
      item = { file: label.file, model, label, result: { ok: false, error: "image", message: image.message } };
    } else {
      const result = await analyzeImage({ model, effort, image, goal, level, context: label.context ?? undefined });
      if (!result.ok && result.error === "auth") authFailed.add(provider);
      if (!result.ok && result.error === "rate_limited") {
        quotaHits.set(provider, (quotaHits.get(provider) ?? 0) + 1);
        if ((quotaHits.get(provider) ?? 0) >= 2) exhausted.add(provider);
      } else quotaHits.set(provider, 0);
      item = {
        file: label.file,
        model,
        label,
        result,
        score: result.ok ? scoreReport(result.report, label) : undefined,
      };
    }
    items.push(item);
    done++;
    await save();
    const status = item.result.ok
      ? `${item.result.report.identification.category} · ${item.result.report.identification.model ?? "sin modelo"} · ${(item.result.usage.latencyMs / 1000).toFixed(1)} s`
      : `ERROR: ${item.result.message}`;
    console.log(`[${done}/${tasks.length}] ${MODELS[model].label} · ${label.file} → ${status}`);
  });

  for (const provider of authFailed) {
    console.error(`\nLa clave ${API_KEY_ENV[provider]} no es válida; se han cancelado sus análisis.`);
  }
  await save();
  const failed = items.filter((i) => !i.result.ok).length;
  const pending = modelKeys.length * labels.length - items.filter((i) => i.result.ok).length;
  console.log(`\nResultados guardados en eval/results/${stamp}/ (resumen.md y results.json).`);
  if (exhausted.size) console.log("Se ha agotado la cuota del servicio de IA por hoy.");
  if (pending > 0) {
    console.log(
      `Quedan ${pending} análisis por completar (${failed} con error). Continúa más tarde con: npm run eval -- --resume`,
    );
  }
}

// Última evaluación guardada en eval/results (las carpetas se nombran por fecha).
async function loadPreviousRun() {
  if (!existsSync(RESULTS_DIR)) fail("No hay evaluaciones anteriores que continuar.");
  const dirs = (await readdir(RESULTS_DIR)).filter((d) => existsSync(path.join(RESULTS_DIR, d, "results.json"))).sort();
  const dir = dirs.at(-1);
  if (!dir) fail("No hay evaluaciones anteriores que continuar.");
  const data = JSON.parse(await readFile(path.join(RESULTS_DIR, dir, "results.json"), "utf8")) as {
    config: {
      models: ModelKey[];
      effort: string;
      maxEdge: number;
      goal: string;
      level: string;
      startedAtIso?: string;
      modelIds?: Record<string, string>;
    };
    items: EvalItem[];
  };
  return {
    dir,
    config: data.config,
    items: data.items,
    startedAtIso: data.config.startedAtIso ?? new Date().toISOString(),
  };
}

async function reportUnlabeledImages(labels: Label[]) {
  if (!existsSync(IMAGES_DIR)) return;
  const labeled = new Set(labels.map((l) => l.file));
  const unlabeled = (await readdir(IMAGES_DIR)).filter(
    (f) => !f.startsWith(".") && /\.(jpe?g|png|webp|heic|heif)$/i.test(f) && !labeled.has(f),
  );
  if (unlabeled.length) {
    console.warn(`Fotos sin etiqueta (se ignoran): ${unlabeled.join(", ")}. Ejecuta «npm run eval:prepare».`);
  }
}

// Estimación previa sin llamar a la API. Los tokens de imagen se aproximan
// como ancho × alto / 750, con el tope de ~4.784 de los modelos de alta
// resolución; la prueba real mide los tokens exactos.
function dryRun(labels: Label[], images: Map<string, PreparedImage | ImageError>, models: ModelKey[]) {
  const PROMPT_TOKENS = 1500;
  const OUTPUT_TOKENS = 4000;
  let imageTokens = 0;
  for (const label of labels) {
    const image = images.get(label.file) as PreparedImage;
    const tokens = Math.min(4784, Math.ceil((image.width * image.height) / 750));
    imageTokens += tokens;
    console.log(
      `  ✓ ${label.file}: ${image.width}×${image.height}, ${(image.bytes / 1024).toFixed(0)} KB, ~${tokens} tokens`,
    );
  }
  console.log(
    `\n${labels.length} foto(s) listas. Estimación orientativa (suponiendo ~${OUTPUT_TOKENS} tokens de salida por análisis):`,
  );
  for (const model of models) {
    const cost = estimateCostUsd(model, imageTokens + PROMPT_TOKENS * labels.length, OUTPUT_TOKENS * labels.length);
    console.log(`  ${MODELS[model].label}: ~$${cost.toFixed(cost < 1 ? 3 : 2)} en total`);
  }
}

async function runPool<T>(tasks: T[], size: number, worker: (task: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) await worker(tasks[next++]);
    }),
  );
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await main();
