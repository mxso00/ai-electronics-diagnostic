import { checkLink } from "./link-check";
import { isOfficialUrl, normalizeName, officialManufacturer } from "./official-domains";
import { DocsError, type DocLink, type DocsResult, type DocType } from "./types";

// Búsqueda de documentación técnica:
// 1. Tavily busca en los dominios oficiales del fabricante (y, si hace falta,
//    en el resto de la web).
// 2. Solo se aceptan resultados con el modelo exacto en el título o en la
//    dirección. No basta con que aparezca en el texto: las páginas de modelos
//    parecidos (p. ej. X670E-E) lo citan como «producto relacionado».
// 3. Cada enlace se abre desde el servidor para confirmar que funciona.
// Nada lo escribe un modelo de IA: los enlaces salen del buscador y se comprueban.

const TAVILY_URL = "https://api.tavily.com/search";
const MAX_LINKS = 6;
const CACHE_MS = 24 * 60 * 60 * 1000;

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

// Caché en memoria para no gastar búsquedas repitiendo la misma consulta.
const cache = new Map<string, DocsResult>();

export async function findDocumentation(manufacturer: string | null, model: string): Promise<DocsResult> {
  const key = `${normalizeName(manufacturer ?? "")}|${normalizeName(model)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached;

  const official = officialManufacturer(manufacturer);
  const query = [manufacturer, model, "manual specifications support"].filter(Boolean).join(" ");

  let results = official ? await tavilySearch(query, official.domains) : [];
  // Si en la web oficial no aparece nada del modelo, se amplía al resto de la web.
  if (!results.some((r) => mentionsModel(r, model))) {
    results = [...results, ...(await tavilySearch(query))];
  }

  const isOfficial = (url: string) => (official ? isOfficialUrl(url, official.domains) : false);
  const candidates = dedupe(results.filter((r) => r.url && !isDiscussion(r.url) && mentionsModel(r, model)));
  const checked = await Promise.all(
    candidates.slice(0, 10).map(async (r) => {
      const status = await checkLink(r.url!);
      if (!status.ok) return null;
      const url = status.finalUrl;
      return {
        title: cleanTitle(r.title, model),
        url,
        domain: new URL(url).hostname.replace(/^www\./, ""),
        type: classify(url, r.title ?? ""),
        official: isOfficial(url),
      } satisfies DocLink;
    }),
  );

  // Uno por tipo (dos hojas de datos como mucho): varias páginas de soporte del
  // mismo modelo no aportan nada nuevo.
  const perType = new Map<DocType, number>();
  const links = checked
    .filter((l): l is DocLink => l !== null)
    .sort((a, b) => Number(b.official) - Number(a.official) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .filter((l) => {
      const count = perType.get(l.type) ?? 0;
      perType.set(l.type, count + 1);
      return count < (l.type === "datasheet" ? 2 : 1);
    })
    .slice(0, MAX_LINKS);

  const result: DocsResult = {
    manufacturer,
    model,
    officialSite: official ? official.domains[0] : null,
    links,
    checkedAt: Date.now(),
  };
  cache.set(key, result);
  return result;
}

async function tavilySearch(query: string, includeDomains?: string[]): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new DocsError("not_configured", "Falta TAVILY_API_KEY.");

  let response: Response;
  try {
    response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 10,
        ...(includeDomains ? { include_domains: includeDomains } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new DocsError("service_unavailable", `No se ha podido conectar con Tavily: ${String(error)}`);
  }

  if (response.status === 401) throw new DocsError("not_configured", "Clave de Tavily no válida.");
  if (response.status === 432 || response.status === 433) throw new DocsError("quota", "Cuota de Tavily agotada.");
  if (response.status === 429) throw new DocsError("rate_limited", "Demasiadas búsquedas seguidas en Tavily.");
  if (!response.ok) throw new DocsError("service_unavailable", `Tavily ha respondido ${response.status}.`);

  const data = (await response.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

// El modelo tiene que aparecer completo en el título o en la dirección:
// - Se ignoran espacios, guiones y puntos entre caracteres, así «X670E-F»
//   coincide con «rog-strix-x670e-f-gaming-wifi».
// - No puede ir pegado a más letras o números («LM317T») ni seguido de un
//   sufijo corto de variante con guion («LM317-N», «LM317-N-MIL»), que son
//   otras piezas. Un sufijo largo como «-model» en una dirección sí se admite.
function mentionsModel(result: TavilyResult, model: string) {
  const pattern = modelPattern(model);
  if (!pattern) return false;
  return [result.title, decodeUrl(result.url)].some((text) => text && pattern.test(fold(text)));
}

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function modelPattern(model: string) {
  const chars = normalizeName(model).split("");
  if (chars.length < 3) return null;
  const body = chars.join("[\\s._-]*");
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])(?![-_][a-z0-9]{1,3}(?![a-z0-9]))`);
}

// Foros y comunidades (aunque sean del fabricante) son conversaciones, no
// documentación.
function isDiscussion(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    return (
      /^(e2e|community|forum|forums|answers)\./.test(hostname) ||
      /\/(forum|forums|community|thread|threads)\//i.test(pathname)
    );
  } catch {
    return true;
  }
}

function decodeUrl(url: string | undefined) {
  if (!url) return url;
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function dedupe(results: TavilyResult[]) {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url!.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TYPE_ORDER: Record<DocType, number> = {
  manual: 0,
  datasheet: 1,
  product: 2,
  specs: 3,
  firmware: 4,
  support: 5,
  other: 6,
};

// Tipo de documento por la dirección y el título. Es orientativo; la tarjeta
// muestra siempre el título real.
function classify(url: string, title: string): DocType {
  const text = `${url} ${title}`.toLowerCase();
  if (/datasheet|data sheet|hoja de datos/.test(text)) return "datasheet";
  if (/manual|user guide|user's guide|guía|guia|handbook/.test(text)) return "manual";
  if (/bios|firmware|driver|download|descarga/.test(text)) return "firmware";
  if (/support|soporte|helpdesk|faq/.test(text)) return "support";
  if (/spec|techspec|especificaciones/.test(text)) return "specs";
  if (/\.pdf($|\?)/.test(url)) return "other";
  return "product";
}

// Quita el nombre del sitio que suelen llevar los títulos («… | ROG USA»,
// «… - Support»), siempre que quede algo con sentido.
function cleanTitle(title: string | undefined, model: string) {
  const trimmed = (title ?? "").replace(/\s+/g, " ").trim();
  const firstPart = trimmed.split(/\s+[|｜–—]\s+|\s+-\s+(?=[A-Z][a-z]+(?:\s|$))/)[0]?.trim() ?? "";
  const chosen = firstPart.length >= 4 ? firstPart : trimmed;
  return chosen.length > 0 ? chosen.slice(0, 140) : model;
}
