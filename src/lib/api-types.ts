import type { AnalysisReport } from "@/core/report-schema";
import type { SAFETY_WARNINGS } from "@/core/safety";

// Contrato entre el endpoint /api/analyze y la interfaz. El endpoint responde
// con una línea JSON por evento (NDJSON) para que la interfaz muestre el
// estado real del análisis.

export type SafetyWarning = { id: keyof typeof SAFETY_WARNINGS; level: "danger" | "caution"; text: string };

export interface AnalysisMeta {
  modelLabel: string;
  latencyMs: number;
}

export type AnalyzeEvent =
  | { type: "stage"; stage: "analyzing" }
  | { type: "result"; report: AnalysisReport; warnings: SafetyWarning[]; meta: AnalysisMeta }
  | { type: "error"; message: string; retryable: boolean };

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_CONTEXT_CHARS = 1000;

// Chat sobre un análisis: la interfaz envía la foto, el informe y la
// conversación completa en cada pregunta; el servidor no guarda nada.
export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; modelLabel: string }
  | { type: "error"; message: string; retryable: boolean };

export const MAX_CHAT_MESSAGES = 20;
export const MAX_QUESTION_CHARS = 1500;
