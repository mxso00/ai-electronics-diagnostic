"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/core/chat-types";
import type { AnalysisReport, UserLevel } from "@/core/report-schema";
import { MAX_CHAT_MESSAGES, MAX_QUESTION_CHARS, type ChatEvent } from "@/lib/api-types";
import { RichText } from "./RichText";
import { SectionTitle } from "./ui";

function suggestionsFor(report: AnalysisReport): string[] {
  const damaged = report.diagnosis.status === "visible_damage" || report.diagnosis.status === "possible_damage";
  return [
    "Explícamelo de forma sencilla",
    damaged ? "¿Se puede reparar?" : "¿Cómo compruebo que funciona?",
    damaged ? "¿Qué pudo causar este daño?" : "¿Para qué sirve exactamente?",
    "¿Qué herramientas necesito?",
  ];
}

// Asistente conversacional bajo el informe. Cada pregunta envía la foto, el
// informe y la conversación; el servidor no guarda nada, así que la
// conversación solo existe mientras el informe está abierto.
export function ChatPanel({ report, level, photo }: { report: AnalysisReport; level: UserLevel; photo: Blob }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = pending !== null;
  const atLimit = messages.length >= MAX_CHAT_MESSAGES - 1;

  const run = async (conversation: ChatTurn[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPending("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));

    let answer = "";
    try {
      const body = new FormData();
      body.append("image", photo, "foto.jpg");
      body.append("payload", JSON.stringify({ report, level, messages: conversation }));
      const response = await fetch("/api/chat", { method: "POST", body, signal: controller.signal });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw { message: data?.error ?? "No hemos podido enviar la pregunta.", retryable: response.status >= 500 };
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "delta") {
            answer += event.text;
            setPending(answer);
          } else if (event.type === "error") {
            throw { message: event.message, retryable: event.retryable };
          } else {
            setMessages([...conversation, { role: "assistant", text: answer }]);
            setModelLabel(event.modelLabel);
            setPending(null);
            return;
          }
        }
      }
      throw { message: "La conexión se ha cortado antes de terminar la respuesta.", retryable: true };
    } catch (failure) {
      setPending(null);
      if (controller.signal.aborted) {
        // Detenida por el usuario: se conserva lo que ya había escrito.
        if (answer) setMessages([...conversation, { role: "assistant", text: answer }]);
        else {
          setMessages(conversation.slice(0, -1));
          setDraft(conversation[conversation.length - 1].text);
        }
        return;
      }
      const known = failure as { message?: string; retryable?: boolean };
      setError({
        message: known.message ?? "No hemos podido conectar con el servidor.",
        retryable: known.retryable ?? true,
      });
    }
  };

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || busy || atLimit) return;
    const conversation: ChatTurn[] = [...messages, { role: "user", text }];
    setMessages(conversation);
    setDraft("");
    void run(conversation);
  };

  return (
    <section>
      <SectionTitle eyebrow="Asistente" title="Pregunta sobre este componente" />
      <div className="rounded-3xl border border-border bg-surface shadow-card">
        {messages.length > 0 && (
          <div className="space-y-5 px-5 pt-5 sm:px-6 sm:pt-6" aria-live="polite">
            {messages.map((m, i) =>
              m.role === "user" ? <UserBubble key={i} text={m.text} /> : <AssistantText key={i} text={m.text} />,
            )}
            {pending !== null &&
              (pending ? (
                <AssistantText text={pending} streaming />
              ) : (
                <p className="text-[15px] text-text-tertiary">
                  <span className="animate-breathe">Pensando…</span>
                </p>
              ))}
            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-[14px] text-danger">
                {error.message}
                {error.retryable && messages[messages.length - 1]?.role === "user" && (
                  <button
                    type="button"
                    onClick={() => run(messages)}
                    className="font-medium text-accent hover:underline"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
            {suggestionsFor(report).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-surface-muted px-3.5 py-1.5 text-[14px] text-text-secondary transition-colors hover:border-border-strong hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="p-3 sm:p-4"
        >
          {atLimit ? (
            <p className="px-2 py-2 text-[14px] text-text-tertiary">
              Has llegado al límite de esta conversación. Haz un nuevo análisis para seguir preguntando.
            </p>
          ) : (
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-muted p-1.5 pl-4 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                maxLength={MAX_QUESTION_CHARS}
                rows={1}
                placeholder="Escribe tu pregunta…"
                aria-label="Tu pregunta"
                className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] placeholder:text-text-tertiary focus:outline-none"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-text text-bg"
                  aria-label="Detener respuesta"
                >
                  <Square className="size-3.5" fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
                  aria-label="Enviar pregunta"
                >
                  <ArrowUp className="size-[18px]" strokeWidth={2.25} />
                </button>
              )}
            </div>
          )}
        </form>
      </div>
      <p className="mt-2 px-1 text-[13px] text-text-tertiary">
        Respuestas orientativas: no sustituyen a una comprobación con instrumentos.
        {modelLabel && ` Respondido con ${modelLabel}.`}
      </p>
    </section>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

function AssistantText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="text-[15px] leading-relaxed">
      <RichText text={text} />
      {streaming && <span className="ml-0.5 inline-block h-4 w-[2px] animate-breathe bg-accent align-[-2px]" />}
    </div>
  );
}
