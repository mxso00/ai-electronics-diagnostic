import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadLabels, PENDING_CATEGORY } from "./labels";

// Prepara eval/images para la evaluación:
// 1. Convierte las fotos HEIC del iPhone a JPEG (con «sips», incluido en macOS).
// 2. Añade a eval/labels.csv una fila por cada foto que aún no tenga, con la
//    categoría marcada para revisar, de modo que solo quede rellenarla.

const run = promisify(execFile);
const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, "eval", "images");
const LABELS_PATH = path.join(ROOT, "eval", "labels.csv");
const HEADER = "file,category,manufacturer,model,damage,context,notes\n";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

async function main() {
  if (!existsSync(IMAGES_DIR)) fail("No existe la carpeta eval/images.");

  const converted = await convertHeic();
  if (converted.length) console.log(`Convertidas a JPEG: ${converted.join(", ")}`);

  if (!existsSync(LABELS_PATH)) await writeFile(LABELS_PATH, HEADER);
  const labeled = new Set(
    (await readFile(LABELS_PATH, "utf8"))
      .split(/\r?\n/)
      .slice(1)
      .map((line) => csvFirstField(line))
      .filter(Boolean),
  );

  const images = (await readdir(IMAGES_DIR)).filter(
    (f) => !f.startsWith(".") && IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()),
  );
  const missing = images.filter((f) => !labeled.has(f)).sort();
  if (missing.length) {
    const current = await readFile(LABELS_PATH, "utf8");
    const prefix = current.endsWith("\n") || current.length === 0 ? "" : "\n";
    // Mismo separador que el archivo: Excel en español guarda con punto y coma.
    const firstLine = current.split(/\r?\n/, 1)[0];
    const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const row = (f: string) => [csvQuote(f), PENDING_CATEGORY, "-", "-", "unknown", "", ""].join(sep) + "\n";
    await appendFile(LABELS_PATH, prefix + missing.map(row).join(""));
    console.log(`\nAñadidas ${missing.length} fila(s) a eval/labels.csv:`);
    for (const f of missing) console.log(`  · ${f}`);
    console.log(
      `\nAbre eval/labels.csv y cambia «${PENDING_CATEGORY}» por la categoría correcta de cada foto (ver eval/GUIA.md).`,
    );
  } else {
    console.log("Todas las fotos de eval/images ya tienen su fila en eval/labels.csv.");
  }

  try {
    const labels = await loadLabels(LABELS_PATH);
    console.log(`\neval/labels.csv es válido: ${labels.length} foto(s) listas para evaluar.`);
  } catch (error) {
    console.log(`\nQueda por completar eval/labels.csv:\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function convertHeic() {
  const heic = (await readdir(IMAGES_DIR)).filter((f) => /\.(heic|heif)$/i.test(f));
  if (heic.length && process.platform !== "darwin") {
    console.warn("Hay fotos HEIC, pero la conversión automática solo funciona en macOS. Conviértelas a JPEG.");
    return [];
  }
  const done: string[] = [];
  for (const file of heic) {
    const source = path.join(IMAGES_DIR, file);
    const target = path.join(IMAGES_DIR, file.replace(/\.(heic|heif)$/i, ".jpg"));
    if (existsSync(target)) continue;
    try {
      await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", source, "--out", target]);
      // El original se aparta para que no se evalúe dos veces.
      await rename(source, `${source}.original`);
      done.push(path.basename(target));
    } catch {
      console.warn(`No se ha podido convertir ${file}.`);
    }
  }
  return done;
}

function csvQuote(value: string) {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvFirstField(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('",', 1);
    return (end === -1 ? trimmed.slice(1, -1) : trimmed.slice(1, end)).replace(/""/g, '"');
  }
  return trimmed.split(/[,;]/)[0];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await main();
