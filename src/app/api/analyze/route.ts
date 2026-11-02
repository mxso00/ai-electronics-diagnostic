import * as z from "zod/v4";
import { analyzeImage, type AnalyzeErrorCode } from "@/core/analyze";
import { ImageError, prepareImage } from "@/core/image";
import { API_KEY_ENV, MODELS } from "@/core/models";
import { AnalysisGoal, UserLevel } from "@/core/report-schema";
import { safetyWarnings } from "@/core/safety";
import { MAX_CONTEXT_CHARS, MAX_UPLOAD_BYTES, type AnalyzeEvent } from "@/lib/api-types";
import { activeModel } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

// Un análisis puede tardar más de un minuto.
export const maxDuration = 120;

const Fields = z.object({
  goal: AnalysisGoal.default("auto"),
  level: UserLevel.default("intermediate"),
  context: z.string().max(MAX_CONTEXT_CHARS).optional(),
});

// Mensajes para el usuario. Los detalles técnicos se quedan en el registro
// del servidor.
const ERROR_MESSAGES: Record<AnalyzeErrorCode, { message: string; retryable: boolean }> = {
  refusal: { message: "El servicio de IA no ha podido analizar esta imagen. Prueba con otra foto.", retryable: false },
  truncated: { message: "El análisis ha quedado incompleto. Vuelve a intentarlo.", retryable: true },
  invalid_output: { message: "El análisis no se ha generado correctamente. Vuelve a intentarlo.", retryable: true },
  rate_limited: {
    message: "El servicio de IA está saturado en este momento. Espera un minuto y vuelve a intentarlo.",
    retryable: true,
  },
  auth: { message: "El servicio de IA no está configurado correctamente.", retryable: false },
  bad_request: { message: "El servicio de IA ha rechazado la petición.", retryable: false },
  service_unavailable: {
    message: "El servicio de IA no está disponible ahora mismo. Inténtalo en unos minutos.",
    retryable: true,
  },
  network: { message: "No hemos podido conectar con el servicio de IA. Inténtalo de nuevo.", retryable: true },
};

function jsonError(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const model = activeModel();
  if (!process.env[API_KEY_ENV[MODELS[model].provider]]) {
    console.error(`Falta ${API_KEY_ENV[MODELS[model].provider]} para el modelo ${model}.`);
    return jsonError(503, "El servicio de análisis no está configurado.");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return jsonError(
      429,
      `Has hecho muchos análisis seguidos. Vuelve a intentarlo en ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      {
        "Retry-After": String(limit.retryAfterSeconds),
      },
    );
  }

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
        send({ type: "error", ...ERROR_MESSAGES[result.error] });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
