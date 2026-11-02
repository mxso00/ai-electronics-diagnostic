import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Comprueba que un enlace responde antes de mostrarlo. Como el servidor abre
// direcciones que vienen de un buscador, se protege contra SSRF: solo https,
// puertos estándar y hosts que resuelven a IPs públicas, también en cada
// redirección. (Queda un riesgo teórico de DNS rebinding entre la resolución y
// la conexión; aceptable para comprobar enlaces públicos.)

const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

export type LinkStatus = { ok: true; finalUrl: string } | { ok: false; reason: string };

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicHttps(url: URL) {
  if (url.protocol !== "https:") throw new Error("solo https");
  if (url.port && url.port !== "443") throw new Error("puerto no permitido");
  if (url.username || url.password) throw new Error("credenciales en la URL");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("dirección no pública");
}

export async function checkLink(rawUrl: string): Promise<LinkStatus> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL no válida" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertPublicHttps(url);
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Pedimos el mínimo: solo interesa saber si la página existe.
        headers: { Range: "bytes=0-0", "User-Agent": "Mozilla/5.0 (compatible; ElectronicsDiagnostic/1.0)" },
      });
      await response.body?.cancel();

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, reason: `redirección sin destino (${response.status})` };
        url = new URL(location, url);
        continue;
      }
      // 2xx: existe. 401/403/405/429: el servidor responde pero bloquea a
      // clientes automáticos; la página existe (el buscador la acaba de leer).
      if (response.ok || [401, 403, 405, 416, 429].includes(response.status)) return { ok: true, finalUrl: url.href };
      return { ok: false, reason: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ok: false, reason: "demasiadas redirecciones" };
}
