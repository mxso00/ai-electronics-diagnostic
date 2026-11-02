// Límite de uso por IP con ventana deslizante, en memoria.
// Suficiente para desarrollo y un único servidor. En producción, con varias
// instancias, hay que moverlo a un almacén compartido (p. ej. Redis).

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 8;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}
