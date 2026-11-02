// Límite de uso por IP con ventana deslizante, en memoria.
// Suficiente para desarrollo y un único servidor. En producción, con varias
// instancias, hay que moverlo a un almacén compartido (p. ej. Redis).

const WINDOW_MS = 10 * 60 * 1000;

// Peticiones permitidas por ventana de 10 minutos para cada tipo de petición.
const LIMITS = { analyze: 8, chat: 30 } as const;

const hits = new Map<string, number[]>();

export function checkRateLimit(
  bucket: keyof typeof LIMITS,
  ip: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[bucket]) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
