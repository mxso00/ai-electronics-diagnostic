import type { ChatTurn } from "@/core/chat-types";
import type { AnalysisGoal, AnalysisReport, UserLevel } from "@/core/report-schema";
import type { AnalysisMeta, SafetyWarning } from "./api-types";

// Historial de análisis guardado solo en este dispositivo (IndexedDB). Nada
// sale del navegador: ni la foto ni la conversación se envían a ningún sitio
// para guardarlas.

export interface SavedAnalysis {
  id: string;
  createdAt: number;
  // Foto ya reducida y sin metadatos (la misma que se envió al análisis).
  photo: Blob;
  report: AnalysisReport;
  warnings: SafetyWarning[];
  meta: AnalysisMeta;
  goal: AnalysisGoal;
  level: UserLevel;
  context: string;
  conversation: ChatTurn[];
}

const DB_NAME = "electronics-diagnostic";
const STORE = "analyses";
// Tope para que el historial no crezca sin límite; se borran los más antiguos.
export const MAX_SAVED = 50;

export class HistoryUnavailableError extends Error {}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new HistoryUnavailableError("Este navegador no permite guardar el historial."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new HistoryUnavailableError("No se ha podido abrir el historial."));
  }).catch((error) => {
    // Permite reintentar más tarde (p. ej. tras salir del modo privado).
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error ?? new Error("Error del historial."));
    tx.onabort = () => reject(tx.error ?? new Error("Operación del historial cancelada."));
  });
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  const all = await run<SavedAnalysis[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function getAnalysis(id: string): Promise<SavedAnalysis | undefined> {
  return run<SavedAnalysis | undefined>("readonly", (store) => store.get(id));
}

export async function saveAnalysis(analysis: SavedAnalysis): Promise<void> {
  await run("readwrite", (store) => store.put(analysis));
  const all = await listAnalyses();
  const excess = all.slice(MAX_SAVED);
  if (excess.length) await run("readwrite", (store) => excess.forEach((a) => store.delete(a.id)));
}

export async function updateConversation(id: string, conversation: ChatTurn[]): Promise<void> {
  const current = await getAnalysis(id);
  if (current) await run("readwrite", (store) => store.put({ ...current, conversation }));
}

export function deleteAnalysis(id: string): Promise<void> {
  return run("readwrite", (store) => {
    store.delete(id);
  });
}

export function clearHistory(): Promise<void> {
  return run("readwrite", (store) => {
    store.clear();
  });
}
