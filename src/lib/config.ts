import { isModelKey, MODELS, type ModelKey } from "@/core/models";

// Modelo de IA que usa la aplicación, configurable con AI_MODEL en .env.
// Solo se lee en el servidor.
export function activeModel(): ModelKey {
  const configured = process.env.AI_MODEL ?? "gemini";
  return isModelKey(configured) ? configured : "gemini";
}

// En la capa gratuita el proveedor puede usar las imágenes para entrenar, y
// la interfaz tiene que decirlo.
export function isFreeTierModel(model: ModelKey) {
  return "freeTier" in MODELS[model];
}
