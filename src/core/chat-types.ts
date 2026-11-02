import type { AnalyzeErrorCode } from "./analyze";
import type { PreparedImage } from "./image";
import type { ModelKey } from "./models";
import type { AnalysisReport, UserLevel } from "./report-schema";

// Tipos del chat, separados de chat.ts para que los proveedores puedan usarlos
// sin importaciones circulares.

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatInput {
  model: ModelKey;
  image: PreparedImage;
  report: AnalysisReport;
  level: UserLevel;
  // Conversación completa; el último mensaje es la pregunta del usuario.
  messages: ChatTurn[];
  fallback?: boolean;
}

export class ChatError extends Error {
  constructor(
    readonly code: AnalyzeErrorCode,
    message: string,
  ) {
    super(message);
  }
}
