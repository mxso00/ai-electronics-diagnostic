import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AnalyzeErrorCode, AnalyzeInput, AnalyzeResult, AnalyzeUsage } from "../analyze";
import { buildChatSystemPrompt } from "../chat-prompt";
import { ChatError, type ChatInput } from "../chat-types";
import { estimateCostUsd, MODELS } from "../models";
import { buildUserText, SYSTEM_PROMPT } from "../prompt";
import { AnalysisReport } from "../report-schema";

let client: Anthropic | undefined;

export async function analyzeWithAnthropic(input: AnalyzeInput): Promise<AnalyzeResult> {
  client ??= new Anthropic({ maxRetries: 3, timeout: 5 * 60 * 1000 });
  const started = performance.now();
  let response;
  try {
    response = await client.messages.parse({
      model: MODELS[input.model].id,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: input.effort, format: zodOutputFormat(AnalysisReport) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.base64 } },
            { type: "text", text: buildUserText(input) },
          ],
        },
      ],
    });
  } catch (error) {
    return { ok: false, ...classifyError(error) };
  }

  const usage: AnalyzeUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd: estimateCostUsd(input.model, response.usage.input_tokens, response.usage.output_tokens),
    latencyMs: Math.round(performance.now() - started),
  };

  if (response.stop_reason === "refusal") {
    const detail = response.stop_details?.explanation ?? "sin detalle";
    return { ok: false, error: "refusal", message: `El modelo ha rechazado la petición (${detail}).`, usage };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, error: "truncated", message: "La respuesta se ha cortado por longitud.", usage };
  }
  if (!response.parsed_output) {
    return { ok: false, error: "invalid_output", message: "La respuesta no cumple el esquema del informe.", usage };
  }
  return { ok: true, report: response.parsed_output, usage, modelLabel: MODELS[input.model].label };
}

function classifyError(error: unknown): { error: AnalyzeErrorCode; message: string } {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { error: "auth", message: "Clave de API no válida o sin permisos." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { error: "rate_limited", message: "Límite de uso del servicio alcanzado. Inténtalo más tarde." };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { error: "bad_request", message: `Petición rechazada: ${error.message}` };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { error: "network", message: "No se ha podido conectar con el servicio de IA." };
  }
  if (error instanceof Anthropic.APIError) {
    return { error: "service_unavailable", message: `Error del servicio (${error.status}): ${error.message}` };
  }
  // Errores de validación del SDK al parsear la salida estructurada.
  return { error: "invalid_output", message: error instanceof Error ? error.message : String(error) };
}

// Chat sobre un análisis, con la respuesta en streaming.
export async function* streamChatWithAnthropic(input: ChatInput): AsyncGenerator<string, { modelLabel: string }> {
  client ??= new Anthropic({ maxRetries: 3, timeout: 5 * 60 * 1000 });
  const messages: Anthropic.MessageParam[] = input.messages.map((turn, index) => ({
    role: turn.role,
    content:
      index === 0
        ? [
            { type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.base64 } },
            { type: "text", text: turn.text },
          ]
        : turn.text,
  }));

  let wrote = false;
  try {
    const stream = client.messages.stream({
      model: MODELS[input.model].id,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: buildChatSystemPrompt(input.report, input.level),
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        wrote = true;
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new ChatError("refusal", "El modelo ha rechazado la pregunta.");
    if (!wrote) throw new ChatError("refusal", "El modelo no ha devuelto ninguna respuesta.");
    return { modelLabel: MODELS[input.model].label };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    const { error: code, message } = classifyError(error);
    throw new ChatError(code, message);
  }
}
