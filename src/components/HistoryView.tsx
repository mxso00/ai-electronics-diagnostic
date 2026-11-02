"use client";

import { ChevronRight, History, MessageCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clearHistory, deleteAnalysis, listAnalyses, MAX_SAVED, type SavedAnalysis } from "@/lib/history";
import { CATEGORY_LABEL, STATUS } from "@/lib/labels";
import { Button, Pill } from "./ui";

type Load = { status: "loading" } | { status: "ready"; items: SavedAnalysis[] } | { status: "unavailable" };

export function HistoryView({
  onOpen,
  onNewAnalysis,
}: {
  onOpen: (analysis: SavedAnalysis) => void;
  onNewAnalysis: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // Borrar pide confirmación: el primer toque marca el elemento, el segundo borra.
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    listAnalyses().then(
      (items) => setLoad({ status: "ready", items }),
      () => setLoad({ status: "unavailable" }),
    );
  }, []);

  const items = load.status === "ready" ? load.items : [];
  const thumbnails = useMemo(() => new Map(items.map((a) => [a.id, URL.createObjectURL(a.photo)])), [items]);
  useEffect(() => () => thumbnails.forEach((url) => URL.revokeObjectURL(url)), [thumbnails]);

  const remove = async (id: string) => {
    await deleteAnalysis(id).catch(() => {});
    setConfirming(null);
    setLoad({ status: "ready", items: items.filter((a) => a.id !== id) });
  };

  const removeAll = async () => {
    await clearHistory().catch(() => {});
    setConfirming(null);
    setLoad({ status: "ready", items: [] });
  };

  return (
    <section className="animate-enter mx-auto max-w-3xl px-4 pt-8 pb-24 sm:pt-14">
      <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[-0.02em] sm:text-[40px]">
        Historial
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
        Tus análisis se guardan solo en este dispositivo, con la foto y la conversación. Se conservan los {MAX_SAVED}{" "}
        más recientes.
      </p>

      {load.status === "unavailable" && (
        <p role="alert" className="mt-10 text-[15px] text-text-secondary">
          Este navegador no permite guardar el historial. Suele ocurrir en las ventanas privadas.
        </p>
      )}

      {load.status === "ready" && items.length === 0 && (
        <div className="mt-12 flex flex-col items-center rounded-[28px] border border-border bg-surface px-6 py-14 text-center shadow-card">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <History className="size-6" strokeWidth={1.75} />
          </div>
          <p className="mt-5 text-[17px] font-medium">Aún no hay análisis</p>
          <p className="mt-1 max-w-xs text-[14px] text-text-tertiary">
            Cuando analices una foto, aparecerá aquí para que puedas volver a consultarla.
          </p>
          <Button onClick={onNewAnalysis} className="mt-7">
            Analizar una foto
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <ul className="mt-8 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
            {items.map((a) => {
              const id = a.report.identification;
              const status = STATUS[a.report.diagnosis.status];
              const questions = a.conversation.filter((m) => m.role === "user").length;
              return (
                <li key={a.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onOpen(a)}
                    className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted sm:px-5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:) */}
                    <img
                      src={thumbnails.get(a.id)}
                      alt=""
                      className="size-16 shrink-0 rounded-xl border border-border bg-surface-muted object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[16px] leading-snug font-medium">{id.name}</p>
                      <p className="line-clamp-2 text-[14px] text-text-secondary">
                        {[id.manufacturer, id.model].filter(Boolean).join(" ") || CATEGORY_LABEL[id.category]}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {a.report.image_assessment.shows_electronics && (
                          <Pill tone={status.tone === "neutral" ? "neutral" : status.tone}>{status.label}</Pill>
                        )}
                        <span className="text-[12px] text-text-tertiary">
                          {new Date(a.createdAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        {questions > 0 && (
                          <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
                            <MessageCircle className="size-3.5" />
                            {questions} {questions === 1 ? "pregunta" : "preguntas"}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="hidden size-5 shrink-0 text-text-tertiary sm:block transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => (confirming === a.id ? remove(a.id) : setConfirming(a.id))}
                    onBlur={() => setConfirming((c) => (c === a.id ? null : c))}
                    className={`mr-2 flex h-9 shrink-0 items-center justify-center rounded-full transition-colors sm:mr-3 ${
                      confirming === a.id
                        ? "bg-danger-soft px-3 text-[13px] font-medium text-danger"
                        : "w-9 text-text-tertiary hover:bg-danger-soft hover:text-danger"
                    }`}
                    aria-label={confirming === a.id ? "Confirmar borrado" : `Borrar ${id.name}`}
                  >
                    {confirming === a.id ? "Borrar" : <Trash2 className="size-[17px]" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => (confirming === "all" ? removeAll() : setConfirming("all"))}
              onBlur={() => setConfirming((c) => (c === "all" ? null : c))}
              className={`rounded-full px-4 py-2 text-[14px] transition-colors ${
                confirming === "all" ? "bg-danger-soft font-medium text-danger" : "text-text-tertiary hover:text-danger"
              }`}
            >
              {confirming === "all"
                ? items.length === 1
                  ? "Pulsa otra vez para borrar el análisis"
                  : `Pulsa otra vez para borrar los ${items.length} análisis`
                : "Borrar todo el historial"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
