import { GoogleGenAI } from "@google/genai";
import * as z from "zod/v4";
import type { AnalyzeErrorCode, AnalyzeInput, AnalyzeResult, AnalyzeUsage, Effort } from "../analyze";
import { buildChatSystemPrompt } from "../chat-prompt";
import { ChatError, type ChatInput } from "../chat-types";
import { estimateCostUsd, MODELS } from "../models";
import { buildUserText, SYSTEM_PROMPT } from "../prompt";
import { AnalysisReport } from "../report-schema";

let client: GoogleGenAI | undefined;
let schema: Record<string, unknown> | undefined;

// Los modelos Flash actuales admiten al menos low, medium y high.
const THINKING_LEVEL: Record<Effort, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
};

// La capa gratuita se satura a menudo: un modelo puede tardar minutos en
// devolver un 504 mientras otro responde en segundos. Con fallback activado
// probamos la cadena de modelos en orden y saltamos al siguiente en cuanto uno
// falla por saturación, sin esperar. Sin fallback (evaluación) se reintenta una
// vez el mismo modelo, para no mezclar resultados de modelos distintos.
// Flash-Lite queda fuera a propósito: en las pruebas leyó mal el modelo de una
// placa (X670E-H en lugar de X670E-F). Preferimos un error a un modelo inventado.
const FALLBACK_CHAIN = ["gemini-3.6-flash", "gemini-3.8-flash"];
const LABELS: Record<string, string> = {
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
};

// El SDK de Google reintenta por su cuenta (4 veces, sin límite de tiempo): lo
// desactivamos y controlamos los tiempos aquí.
const DEADLINE_MS = 110_000;
const ATTEMPT_TIMEOUT_MS = 45_000;
const MIN_ATTEMPT_MS = 15_000;
const SAME_MODEL_RETRY_DELAY_MS = 8000;

export async function analyzeWithGemini(input: AnalyzeInput): Promise<AnalyzeResult> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Zod ya expresa los campos nullable como "type": [X, "null"], el formato que
  // recomienda Gemini. Solo quitamos la cabecera $schema.
  schema ??= (({ $schema: _, ...rest }) => rest)(z.toJSONSchema(AnalysisReport) as Record<string, unknown>);
  const started = performance.now();
  const elapsed = () => performance.now() - started;

  const primary: string = MODELS[input.model].id;
  const attempts = input.fallback ? [primary, ...FALLBACK_CHAIN.filter((id) => id !== primary)] : [primary, primary];

  let interaction;
  let modelId: string = primary;
  for (const [index, candidate] of attempts.entries()) {
    modelId = candidate;
    const timeout = Math.min(ATTEMPT_TIMEOUT_MS, DEADLINE_MS - elapsed());
    try {
      interaction = await client.interactions.create(
        {
          model: candidate,
          system_instruction: SYSTEM_PROMPT,
          input: [
            { type: "image", data: input.image.base64, mime_type: input.image.mediaType },
            { type: "text", text: buildUserText(input) },
          ],
          response_format: { type: "text", mime_type: "application/json", schema },
          generation_config: { thinking_level: THINKING_LEVEL[input.effort], max_output_tokens: 16000 },
          // No guardar la petición en los servidores de Google.
          store: false,
        },
        { retries: { strategy: "none" }, timeout_ms: Math.round(timeout) },
      );
      break;
    } catch (error) {
      const classified = classifyError(error);
      console.warn(
        `Gemini ${candidate}: fallo tras ${Math.round(elapsed())} ms (${classified.error}): ${classified.message}`,
      );
      const retryable = ["rate_limited", "service_unavailable", "network"].includes(classified.error);
      const isLast = index === attempts.length - 1;
      const sameModelNext = attempts[index + 1] === candidate;
      const delay = sameModelNext ? SAME_MODEL_RETRY_DELAY_MS : 0;
      if (!retryable || isLast || DEADLINE_MS - elapsed() - delay < MIN_ATTEMPT_MS) return { ok: false, ...classified };
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (!interaction) return { ok: false, error: "service_unavailable", message: "Gemini no está disponible." };

  const inputTokens = interaction.usage?.total_input_tokens ?? 0;
  // Los tokens de razonamiento se facturan como salida.
  const outputTokens = (interaction.usage?.total_output_tokens ?? 0) + (interaction.usage?.total_thought_tokens ?? 0);
  const usage: AnalyzeUsage = {
    inputTokens,
    outputTokens,
    // Estimación con el precio del modelo configurado, aunque responda otro de la cadena.
    costUsd: estimateCostUsd(input.model, inputTokens, outputTokens),
    latencyMs: Math.round(elapsed()),
  };

  if (interaction.status === "incomplete") {
    return { ok: false, error: "truncated", message: "La respuesta se ha cortado por longitud.", usage };
  }
  if (interaction.status !== "completed" || !interaction.output_text) {
    return {
      ok: false,
      error: "refusal",
      message: `El modelo no ha devuelto un informe (estado: ${interaction.status}).`,
      usage,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(interaction.output_text);
  } catch {
    return { ok: false, error: "invalid_output", message: "La respuesta no es JSON válido.", usage };
  }
  const parsed = AnalysisReport.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_output",
      message: `La respuesta no cumple el esquema: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
      usage,
    };
  }
  return { ok: true, report: parsed.data, usage, modelLabel: LABELS[modelId] ?? modelId };
}

function classifyError(error: unknown): { error: AnalyzeErrorCode; message: string } {
  // El SDK usa nombres distintos según la ruta (RequestTimeoutError, APIConnectionTimeoutError).
  if (error instanceof Error && error.name.includes("Timeout")) {
    return { error: "service_unavailable", message: "Gemini no ha respondido a tiempo." };
  }
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
  // Google responde a una clave inválida con un 400 y el motivo API_KEY_INVALID.
  if (status === 401 || status === 403 || errorReason(error) === "API_KEY_INVALID") {
    return { error: "auth", message: "Clave de API de Gemini no válida o sin permisos." };
  }
  if (status === 429) {
    return {
      error: "rate_limited",
      message: "Límite de la capa gratuita de Gemini alcanzado. Espera un minuto o hasta mañana.",
    };
  }
  if (status === 400) {
    return { error: "bad_request", message: `Petición rechazada por Gemini: ${errorMessage(error)}` };
  }
  if (status !== undefined && status >= 500) {
    return { error: "service_unavailable", message: `Error del servicio de Gemini (${status}).` };
  }
  return { error: "network", message: `No se ha podido conectar con Gemini: ${errorMessage(error)}` };
}

function parseErrorBody(error: unknown): { message?: string; details?: { reason?: string }[] } | undefined {
  const body = typeof error === "object" && error && "body" in error ? error.body : undefined;
  if (typeof body !== "string") return undefined;
  try {
    const parsed = JSON.parse(body);
    return (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
  } catch {
    return undefined;
  }
}

function errorReason(error: unknown) {
  return parseErrorBody(error)?.details?.find((d) => d.reason)?.reason;
}

function errorMessage(error: unknown) {
  return parseErrorBody(error)?.message ?? (error instanceof Error ? error.message : String(error));
}

// Chat sobre un análisis. Si el modelo falla por saturación antes de empezar a
// responder, pasamos al siguiente de la cadena; una vez empezada la respuesta
// no se cambia de modelo.
export async function* streamChatWithGemini(input: ChatInput): AsyncGenerator<string, { modelLabel: string }> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const started = performance.now();
  const primary: string = MODELS[input.model].id;
  const candidates = input.fallback ? [primary, ...FALLBACK_CHAIN.filter((id) => id !== primary)] : [primary];

  const steps = input.messages.map((turn, index) => {
    const content: ({ type: "text"; text: string } | { type: "image"; data: string; mime_type: "image/jpeg" })[] = [
      { type: "text", text: turn.text },
    ];
    // La foto va en el primer mensaje del usuario.
    if (index === 0) content.unshift({ type: "image", data: input.image.base64, mime_type: input.image.mediaType });
    return turn.role === "user" ? { type: "user_input" as const, content } : { type: "model_output" as const, content };
  });

  for (const [index, candidate] of candidates.entries()) {
    let startedOutput = false;
    try {
      const stream = await client.interactions.create(
        {
          model: candidate,
          system_instruction: buildChatSystemPrompt(input.report, input.level),
          input: steps,
          generation_config: { thinking_level: "low", max_output_tokens: 4000 },
          store: false,
          stream: true,
        },
        {
          retries: { strategy: "none" },
          timeout_ms: Math.round(Math.min(ATTEMPT_TIMEOUT_MS, DEADLINE_MS - (performance.now() - started))),
        },
      );
      for await (const event of stream) {
        if (event.event_type === "step.delta" && event.delta.type === "text" && event.delta.text) {
          startedOutput = true;
          yield event.delta.text;
        } else if (event.event_type === "error") {
          throw new ChatError("service_unavailable", event.error?.message ?? "Error durante la respuesta.");
        }
      }
      if (!startedOutput) throw new ChatError("refusal", "El modelo no ha devuelto ninguna respuesta.");
      return { modelLabel: LABELS[candidate] ?? candidate };
    } catch (error) {
      const chatError = error instanceof ChatError ? error : toChatError(error);
      console.warn(`Gemini chat ${candidate}: ${chatError.code}: ${chatError.message}`);
      const retryable = ["rate_limited", "service_unavailable", "network"].includes(chatError.code);
      const timeLeft = DEADLINE_MS - (performance.now() - started);
      if (startedOutput || !retryable || index === candidates.length - 1 || timeLeft < MIN_ATTEMPT_MS) throw chatError;
    }
  }
  throw new ChatError("service_unavailable", "Gemini no está disponible.");
}

function toChatError(error: unknown) {
  const { error: code, message } = classifyError(error);
  return new ChatError(code, message);
}
