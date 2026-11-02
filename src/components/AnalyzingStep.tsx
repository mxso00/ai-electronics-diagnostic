"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";

export type AnalyzingStage = "preparing" | "uploading" | "analyzing";

// Cada estado corresponde a algo que está pasando de verdad: preparar la foto
// en el navegador, enviarla y esperar al modelo (el servidor avisa cuando
// empieza el análisis).
const STAGE_TEXT: Record<AnalyzingStage, string> = {
  preparing: "Preparando la imagen",
  uploading: "Enviando la imagen",
  analyzing: "Analizando con IA",
};

export function AnalyzingStep({
  previewUrl,
  stage,
  onCancel,
}: {
  previewUrl: string;
  stage: AnalyzingStage;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="animate-enter mx-auto flex max-w-xl flex-col items-center px-4 pt-10 text-center sm:pt-20">
      <div className="relative w-full overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
        <img src={previewUrl} alt="" className="animate-breathe max-h-[40vh] w-full object-contain" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-accent-soft">
          <div className="animate-indeterminate h-full w-2/5 rounded-full bg-accent" />
        </div>
      </div>

      <p aria-live="polite" className="mt-8 font-display text-[22px] font-semibold tracking-[-0.01em]">
        {STAGE_TEXT[stage]}
      </p>
      <p className="mt-2 text-[15px] text-text-secondary">
        {stage !== "analyzing"
          ? "Un momento…"
          : seconds < 60
            ? "Suele tardar entre 20 segundos y un minuto."
            : "Está tardando más de lo habitual. Seguimos esperando la respuesta."}
      </p>
      <p className="mt-1 text-[13px] text-text-tertiary tabular-nums">{seconds} s</p>

      <Button variant="ghost" onClick={onCancel} className="mt-6">
        Cancelar
      </Button>
    </section>
  );
}
