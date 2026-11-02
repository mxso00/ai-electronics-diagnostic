import * as z from "zod/v4";
import { findDocumentation } from "@/core/docs/search";
import { DocsError } from "@/core/docs/types";
import { jsonError, rateLimitError } from "@/lib/api-errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const maxDuration = 60;

const Body = z.object({
  manufacturer: z.string().trim().min(1).max(80).nullable(),
  model: z.string().trim().min(3).max(100),
});

const MESSAGES: Record<DocsError["code"], { status: number; message: string }> = {
  not_configured: { status: 503, message: "La búsqueda de documentación no está configurada." },
  quota: { status: 503, message: "Se ha agotado la cuota mensual de búsquedas de documentación." },
  rate_limited: { status: 429, message: "Demasiadas búsquedas seguidas. Inténtalo en un minuto." },
  service_unavailable: { status: 503, message: "El buscador no está disponible ahora mismo. Inténtalo más tarde." },
};

export async function POST(request: Request) {
  const limit = checkRateLimit("docs", clientIp(request));
  if (!limit.allowed) return rateLimitError(limit.retryAfterSeconds, "muchas búsquedas seguidas");

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Los datos de la búsqueda no son válidos.");

  try {
    return Response.json(await findDocumentation(body.data.manufacturer, body.data.model));
  } catch (error) {
    if (error instanceof DocsError) {
      console.error(`Documentación (${error.code}): ${error.message}`);
      const { status, message } = MESSAGES[error.code];
      return jsonError(status, message);
    }
    throw error;
  }
}
