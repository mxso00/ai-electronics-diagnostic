import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { ComponentCategory } from "../core/report-schema";

// Una fila de eval/labels.csv: la respuesta correcta para cada foto.
// Los campos vacíos o "-" significan «no se sabe» o «no es visible en la foto».
export const Label = z.object({
  file: z.string().min(1),
  category: ComponentCategory,
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  damage: z.enum(["yes", "no", "unknown"]),
  notes: z.string().nullable(),
  // Opcional: lo que contaría el usuario («no enciende», «huele a quemado»).
  context: z.string().nullable(),
});
export type Label = z.infer<typeof Label>;

const COLUMNS = ["file", "category", "manufacturer", "model", "damage", "notes"] as const;

export async function loadLabels(path: string): Promise<Label[]> {
  const text = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) throw new Error(`${path} está vacío.`);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Faltan columnas en ${path}: ${missing.join(", ")}`);

  const problems: string[] = [];
  const labels: Label[] = [];
  rows.slice(1).forEach((row, i) => {
    const get = (col: string) => {
      const index = header.indexOf(col);
      const value = index === -1 ? "" : (row[index] ?? "").trim();
      return value === "" || value === "-" ? null : value;
    };
    const parsed = Label.safeParse({
      file: get("file") ?? "",
      category: get("category") ?? "unknown",
      manufacturer: get("manufacturer"),
      model: get("model"),
      damage: get("damage") ?? "unknown",
      notes: get("notes"),
      context: get("context"),
    });
    if (parsed.success) labels.push(parsed.data);
    else
      problems.push(
        `línea ${i + 2}: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
      );
  });
  if (problems.length) throw new Error(`Errores en ${path}:\n  ${problems.join("\n  ")}`);
  return labels;
}

// CSV mínimo con comillas. Acepta coma o punto y coma como separador, porque
// Excel en español exporta con punto y coma.
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
