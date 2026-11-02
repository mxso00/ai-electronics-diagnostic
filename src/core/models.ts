// Modelos candidatos y su precio de pago por millón de tokens (noviembre de
// 2026). Revisa los precios en la web oficial antes de tomar decisiones de
// coste: aquí solo sirven para estimar.
export type Provider = "anthropic" | "google";

interface ModelInfo {
  id: string;
  label: string;
  provider: Provider;
  inputPerM: number;
  outputPerM: number;
  // En la capa gratuita no se paga, pero el proveedor puede usar los datos
  // para entrenar. Mostramos igualmente el precio de pago como referencia.
  freeTier?: boolean;
}

export const MODELS = {
  opus: { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", inputPerM: 4, outputPerM: 20 },
  sonnet: { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", inputPerM: 2, outputPerM: 10 },
  haiku: { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "anthropic", inputPerM: 0.1, outputPerM: 0.5 },
  // Precio de pago de Gemini 3.6 y 3.8 Flash hasta el 31/12/2026; se duplica en 2027.
  gemini: {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "google",
    inputPerM: 0.75,
    outputPerM: 3.75,
    freeTier: true,
  },
  gemini38: {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "google",
    inputPerM: 0.75,
    outputPerM: 3.75,
    freeTier: true,
  },
} as const satisfies Record<string, ModelInfo>;

export type ModelKey = keyof typeof MODELS;

export const API_KEY_ENV: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
};

export function isModelKey(value: string): value is ModelKey {
  return value in MODELS;
}

export function estimateCostUsd(model: ModelKey, inputTokens: number, outputTokens: number) {
  const { inputPerM, outputPerM } = MODELS[model];
  return (inputTokens * inputPerM + outputTokens * outputPerM) / 1_000_000;
}
