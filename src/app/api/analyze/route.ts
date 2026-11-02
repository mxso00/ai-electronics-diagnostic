import * as z from "zod/v4";
import { analyzeImage } from "@/core/analyze";
import { ImageError, prepareImage } from "@/core/image";
import { API_KEY_ENV, MODELS } from "@/core/models";
import { AnalysisGoal, UserLevel } from "@/core/report-schema";
import { safetyWarnings } from "@/core/safety";
import { jsonError, rateLimitError, userFacingError } from "@/lib/api-errors";
import { MAX_CONTEXT_CHARS, MAX_UPLOAD_BYTES, type AnalyzeEvent } from "@/lib/api-types";
import { activeModel } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Un análisis puede tardar más de un minuto.
export const maxDuration = 120;

const Fields = z.object({
  goal: AnalysisGoal.default("auto"),
  level: UserLevel.default("intermediate"),
  context: z.string().max(MAX_CONTEXT_CHARS).optional(),
});

export async function POST(request: Request) {
  const model = activeModel();
  if (!process.env[API_KEY_ENV[MODELS[model].provider]]) {
    console.error(`Falta ${API_KEY_ENV[MODELS[model].provider]} para el modelo ${model}.`);
    return jsonError(503, "El servicio de análisis no está configurado.");
  }

  const limit = checkRateLimit("analyze", clientIp(request));
  if (!limit.allowed) return rateLimitError(limit.retryAfterSeconds, "muchos análisis seguidos");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "La petición no es válida.");
  }
  const file = form.get("image");
  if (!(file instanceof File)) return jsonError(400, "Falta la imagen.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "La imagen es demasiado grande (máximo 15 MB).");

  const fields = Fields.safeParse({
    goal: form.get("goal") ?? undefined,
    level: form.get("level") ?? undefined,
    context: form.get("context") || undefined,
  });
  if (!fields.success) return jsonError(400, "Los datos del formulario no son válidos.");

  let image;
  try {
    image = await prepareImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageError) return jsonError(422, error.message);
    throw error;
  }

  // A partir de aquí la respuesta es un flujo de eventos: la imagen es válida
  // y el análisis empieza de verdad.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalyzeEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ type: "stage", stage: "analyzing" });

      // Esfuerzo medio: en las pruebas da el mismo diagnóstico en mucho menos tiempo.
      const result = await analyzeImage({ model, effort: "medium", image, fallback: true, ...fields.data });
      if (result.ok) {
        send({
          type: "result",
          report: result.report,
          warnings: safetyWarnings(result.report),
          meta: { modelLabel: result.modelLabel, latencyMs: result.usage.latencyMs },
        });
      } else {
        console.error(`Análisis fallido (${result.error}): ${result.message}`);
        send({ type: "error", ...userFacingError(result.error, "analysis") });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
