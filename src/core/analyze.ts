import type { PreparedImage } from "./image";
import { MODELS, type ModelKey } from "./models";
import { analyzeWithAnthropic } from "./providers/anthropic";
import { analyzeWithGemini } from "./providers/gemini";
import type { AnalysisGoal, AnalysisReport, UserLevel } from "./report-schema";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnalyzeInput {
  model: ModelKey;
  effort: Effort;
  image: PreparedImage;
  goal: AnalysisGoal;
  level: UserLevel;
  context?: string;
  // Permite que responda otro modelo del mismo proveedor si el elegido está
  // saturado. La aplicación lo activa; la evaluación no, para no mezclar modelos.
  fallback?: boolean;
}

export interface AnalyzeUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export type AnalyzeResult =
  | { ok: true; report: AnalysisReport; usage: AnalyzeUsage; modelLabel: string }
  | { ok: false; error: AnalyzeErrorCode; message: string; usage?: AnalyzeUsage };

export type AnalyzeErrorCode =
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "rate_limited"
  | "auth"
  | "bad_request"
  | "service_unavailable"
  | "network";

// Punto único de entrada al análisis. El resto de la aplicación solo conoce
// AnalyzeInput y AnalyzeResult; cada proveedor vive en su propio archivo.
export function analyzeImage(input: AnalyzeInput): Promise<AnalyzeResult> {
  switch (MODELS[input.model].provider) {
    case "anthropic":
      return analyzeWithAnthropic(input);
    case "google":
      return analyzeWithGemini(input);
  }
}
