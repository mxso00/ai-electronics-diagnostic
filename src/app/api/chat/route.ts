import * as z from "zod/v4";
import { ChatError, streamChat } from "@/core/chat";
import { ImageError, prepareImage } from "@/core/image";
import { API_KEY_ENV, MODELS } from "@/core/models";
import { AnalysisReport, UserLevel } from "@/core/report-schema";
import { jsonError, rateLimitError, userFacingError } from "@/lib/api-errors";
import { MAX_CHAT_MESSAGES, MAX_QUESTION_CHARS, MAX_UPLOAD_BYTES, type ChatEvent } from "@/lib/api-types";
import { activeModel } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const maxDuration = 120;

const Payload = z
  .object({
    report: AnalysisReport,
    level: UserLevel,
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().min(1).max(8000),
        }),
      )
      .min(1)
      .max(MAX_CHAT_MESSAGES),
  })
  // La conversación alterna usuario y asistente, empieza y termina con el usuario.
  .refine((p) => p.messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")), "Orden no válido")
  .refine((p) => p.messages.length % 2 === 1, "Falta la pregunta")
  .refine(
    (p) => p.messages.every((m) => m.role === "assistant" || m.text.length <= MAX_QUESTION_CHARS),
    "Pregunta larga",
  );

export async function POST(request: Request) {
  const model = activeModel();
  if (!process.env[API_KEY_ENV[MODELS[model].provider]]) {
    console.error(`Falta ${API_KEY_ENV[MODELS[model].provider]} para el modelo ${model}.`);
    return jsonError(503, "El asistente no está configurado.");
  }

  const limit = checkRateLimit("chat", clientIp(request));
  if (!limit.allowed) return rateLimitError(limit.retryAfterSeconds, "muchas preguntas seguidas");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "La petición no es válida.");
  }
  const file = form.get("image");
  if (!(file instanceof File)) return jsonError(400, "Falta la imagen.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "La imagen es demasiado grande.");

  let payload;
  try {
    payload = Payload.safeParse(JSON.parse(String(form.get("payload"))));
  } catch {
    return jsonError(400, "La petición no es válida.");
  }
  if (!payload.success) return jsonError(400, "La conversación no es válida.");

  let image;
  try {
    image = await prepareImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageError) return jsonError(422, error.message);
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const chat = streamChat({ model, image, fallback: true, ...payload.data });
      try {
        for (;;) {
          const next = await chat.next();
          if (next.done) {
            send({ type: "done", modelLabel: next.value.modelLabel });
            break;
          }
          send({ type: "delta", text: next.value });
        }
      } catch (error) {
        const code = error instanceof ChatError ? error.code : "service_unavailable";
        console.error(`Chat fallido (${code}): ${error instanceof Error ? error.message : String(error)}`);
        send({ type: "error", ...userFacingError(code, "chat") });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
