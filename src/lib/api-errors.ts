import type { AnalyzeErrorCode } from "@/core/analyze";

// Mensajes de error para el usuario. Los detalles técnicos se quedan en el
// registro del servidor.

const SERVICE_ERRORS: Partial<Record<AnalyzeErrorCode, { message: string; retryable: boolean }>> = {
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

const ANALYSIS_ERRORS: Partial<Record<AnalyzeErrorCode, { message: string; retryable: boolean }>> = {
  refusal: { message: "El servicio de IA no ha podido analizar esta imagen. Prueba con otra foto.", retryable: false },
  truncated: { message: "El análisis ha quedado incompleto. Vuelve a intentarlo.", retryable: true },
  invalid_output: { message: "El análisis no se ha generado correctamente. Vuelve a intentarlo.", retryable: true },
};

const CHAT_ERRORS: Partial<Record<AnalyzeErrorCode, { message: string; retryable: boolean }>> = {
  refusal: { message: "No he podido responder a esta pregunta. Prueba a formularla de otra manera.", retryable: false },
  truncated: { message: "La respuesta ha quedado incompleta. Vuelve a intentarlo.", retryable: true },
  invalid_output: { message: "La respuesta no se ha generado correctamente. Vuelve a intentarlo.", retryable: true },
};

export function userFacingError(code: AnalyzeErrorCode, context: "analysis" | "chat") {
  const specific = context === "analysis" ? ANALYSIS_ERRORS : CHAT_ERRORS;
  return specific[code] ?? SERVICE_ERRORS[code] ?? { message: "Ha ocurrido un error inesperado.", retryable: true };
}

export function jsonError(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export function rateLimitError(retryAfterSeconds: number, what: string) {
  return jsonError(
    429,
    `Has hecho ${what}. Vuelve a intentarlo en ${Math.ceil(retryAfterSeconds / 60)} min.`,
    {
      "Retry-After": String(retryAfterSeconds),
    },
  );
}
