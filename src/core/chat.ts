import type { ChatInput } from "./chat-types";
import { MODELS } from "./models";
import { streamChatWithAnthropic } from "./providers/anthropic";
import { streamChatWithGemini } from "./providers/gemini";

export { ChatError, type ChatInput, type ChatTurn } from "./chat-types";

// Devuelve la respuesta en fragmentos de texto a medida que se genera y, al
// terminar, el nombre del modelo que ha respondido. Los fallos se lanzan como
// ChatError.
export function streamChat(input: ChatInput): AsyncGenerator<string, { modelLabel: string }> {
  switch (MODELS[input.model].provider) {
    case "anthropic":
      return streamChatWithAnthropic(input);
    case "google":
      return streamChatWithGemini(input);
  }
}
