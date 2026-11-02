import { MODELS, type ModelKey } from "../core/models";
import type { AnalyzeResult } from "../core/analyze";
import type { Label } from "./labels";
import type { Score } from "./score";

export interface EvalItem {
  file: string;
  model: ModelKey;
  label: Label;
  result: AnalyzeResult | { ok: false; error: "image"; message: string };
  score?: Score;
}

export interface EvalConfig {
  models: ModelKey[];
  effort: string;
  maxEdge: number;
  goal: string;
  level: string;
  startedAt: string;
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${n}/${d} (${Math.round((n / d) * 100)} %)`);
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const cell = (s: string | null | undefined) => (s ?? "–").replace(/\|/g, "\\|").replace(/\n/g, " ");

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function renderSummary(config: EvalConfig, items: EvalItem[]): string {
  const out: string[] = [];
  out.push(`# Resultados de la prueba técnica`, "");
  out.push(
    `- Fecha: ${config.startedAt}`,
    `- Modelos: ${config.models.map((m) => MODELS[m].label).join(", ")}`,
    `- Esfuerzo: ${config.effort} · Lado máximo de imagen: ${config.maxEdge} px · Objetivo: ${config.goal} · Nivel: ${config.level}`,
    `- Imágenes: ${new Set(items.map((i) => i.file)).size}`,
    "",
    "Las métricas automáticas son orientativas. Revisa a mano cada informe, sobre todo los marcados como «sospechoso» o con incumplimientos.",
    "",
    "## Resumen por modelo",
    "",
  );

  const header = ["Métrica", ...config.models.map((m) => MODELS[m].label)];
  const rows: string[][] = [];
  const stats = config.models.map((model) => {
    const mine = items.filter((i) => i.model === model);
    const ok = mine.filter((i) => i.result.ok && i.score);
    const scores = ok.map((i) => i.score!);
    const usages = mine.flatMap((i) => ("usage" in i.result && i.result.usage ? [i.result.usage] : []));
    const latencies = usages.map((u) => u.latencyMs);
    const cost = usages.reduce((sum, u) => sum + u.costUsd, 0);
    const withModel = scores.filter((s) => ["correct", "partial", "wrong", "abstained"].includes(s.model));
    const withoutModel = scores.filter((s) => ["null_ok", "suspect"].includes(s.model));
    const damaged = scores.filter((s) => ["detected", "missed", "abstained"].includes(s.damage));
    const healthy = scores.filter((s) => ["true_negative", "false_alarm", "possible_flag"].includes(s.damage));
    const count = (list: Score[], key: "model" | "damage", value: string) =>
      list.filter((s) => s[key] === value).length;
    return {
      "Análisis completados": pct(ok.length, mine.length),
      "Categoría acertada": pct(scores.filter((s) => s.categoryOk).length, scores.length),
      "Modelo visible: acertado": pct(count(withModel, "model", "correct"), withModel.length),
      "Modelo visible: parcial (revisar)": pct(count(withModel, "model", "partial"), withModel.length),
      "Modelo visible: incorrecto": pct(count(withModel, "model", "wrong"), withModel.length),
      "Modelo visible: sin respuesta": pct(count(withModel, "model", "abstained"), withModel.length),
      "Sin modelo visible: inventa uno (revisar)": pct(count(withoutModel, "model", "suspect"), withoutModel.length),
      "Con daño: detectado": pct(count(damaged, "damage", "detected"), damaged.length),
      "Con daño: no detectado": pct(count(damaged, "damage", "missed"), damaged.length),
      "Sin daño: falsa alarma": pct(count(healthy, "damage", "false_alarm"), healthy.length),
      "Sin daño: lo marca como posible": pct(count(healthy, "damage", "possible_flag"), healthy.length),
      "Informes con incumplimientos": pct(scores.filter((s) => s.violations.length).length, scores.length),
      "Latencia media / p90": latencies.length
        ? `${seconds(latencies.reduce((a, b) => a + b, 0) / latencies.length)} / ${seconds(percentile(latencies, 90))}`
        : "–",
      // En la capa gratuita no se paga; el precio de pago sirve para comparar.
      "Coste medio por análisis (precio de pago)": usages.length ? usd(cost / usages.length) : "–",
      "Coste estimado por 1.000 análisis (precio de pago)": usages.length ? usd((cost / usages.length) * 1000) : "–",
      "Coste real de esta prueba": "freeTier" in MODELS[model] ? "$0 (capa gratuita)" : usd(cost),
    } as Record<string, string>;
  });
  for (const metric of Object.keys(stats[0] ?? {})) {
    rows.push([metric, ...stats.map((s) => s[metric])]);
  }
  out.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);
  for (const row of rows) out.push(`| ${row.join(" | ")} |`);
  out.push("");

  out.push("## Revisión por imagen", "");
  const files = [...new Set(items.map((i) => i.file))];
  for (const file of files) {
    const label = items.find((i) => i.file === file)!.label;
    out.push(`### ${file}`, "", `![${file}](<../../images/${file}>)`, "");
    out.push(
      `**Esperado:** ${label.category} · ${[label.manufacturer, label.model].filter(Boolean).join(" ") || "sin modelo visible"} · daño: ${label.damage}` +
        (label.context ? ` · contexto: «${label.context}»` : "") +
        (label.notes ? ` · notas: ${label.notes}` : ""),
      "",
      "| Modelo | Categoría | Fabricante y modelo | Confianza | Estado | Resumen | Incumplimientos | Coste · tiempo |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const item of items.filter((i) => i.file === file)) {
      const name = MODELS[item.model].label;
      if (!item.result.ok) {
        out.push(`| ${name} | ❌ ${cell(item.result.message)} | | | | | | |`);
        continue;
      }
      const { report, usage } = item.result;
      const s = item.score!;
      const id = report.identification;
      out.push(
        `| ${name} | ${s.categoryOk ? "✅" : "❌"} ${id.category} | ${cell([id.manufacturer, id.model].filter(Boolean).join(" ") || null)} (${s.model}) | ${id.confidence} | ${report.diagnosis.status} (${s.damage}) | ${cell(report.summary)} | ${cell(s.violations.join(" ") || null)} | ${usd(usage.costUsd)} · ${seconds(usage.latencyMs)} |`,
      );
    }
    out.push("");
  }
  out.push("El informe completo de cada análisis está en `results.json`.", "");
  return out.join("\n");
}
