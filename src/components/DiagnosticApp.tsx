"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisReport } from "@/core/report-schema";
import type { AnalysisMeta, AnalyzeEvent, SafetyWarning } from "@/lib/api-types";
import { ClientImageError, prepareForUpload } from "@/lib/client-image";
import { AnalyzingStep, type AnalyzingStage } from "./AnalyzingStep";
import { CaptureStep } from "./CaptureStep";
import { PrepareStep, type AnalysisOptions } from "./PrepareStep";
import { ReportView } from "./ReportView";
import { Button } from "./ui";

type Photo = { file: File; previewUrl: string };

type State =
  | { step: "capture"; error?: string }
  | { step: "prepare"; photo: Photo }
  | { step: "analyzing"; photo: Photo; stage: AnalyzingStage }
  | {
      step: "report";
      photo: Photo;
      // Foto ya reducida y sin metadatos: el asistente la reutiliza en cada pregunta.
      upload: Blob;
      report: AnalysisReport;
      warnings: SafetyWarning[];
      meta: AnalysisMeta;
    }
  | { step: "error"; photo: Photo; message: string; retryable: boolean };

const DEFAULT_OPTIONS: AnalysisOptions = { goal: "auto", level: "intermediate", context: "" };

class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function DiagnosticApp({ testMode }: { testMode: boolean }) {
  const [state, setState] = useState<State>({ step: "capture" });
  const [options, setOptions] = useState<AnalysisOptions>(DEFAULT_OPTIONS);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);

  // La vista previa es una URL local del navegador; se libera al cambiar de foto.
  const setPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
  };
  useEffect(() => () => setPreview(null), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const choosePhoto = (file: File) => {
    if (file.type && !file.type.startsWith("image/")) {
      setState({ step: "capture", error: "El archivo no es una imagen." });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setState({ step: "prepare", photo: { file, previewUrl } });
  };

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPreview(null);
    setState({ step: "capture" });
  }, []);

  const analyze = async (photo: Photo, opts: AnalysisOptions) => {
    setOptions(opts);
    const controller = new AbortController();
    abortRef.current = controller;
    const setStage = (stage: AnalyzingStage) => setState({ step: "analyzing", photo, stage });

    try {
      setStage("preparing");
      const blob = await prepareForUpload(photo.file);

      setStage("uploading");
      const body = new FormData();
      body.append("image", blob, "foto.jpg");
      body.append("goal", opts.goal);
      body.append("level", opts.level);
      if (opts.context.trim()) body.append("context", opts.context.trim());
      const response = await fetch("/api/analyze", { method: "POST", body, signal: controller.signal });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new AnalyzeError(data?.error ?? "No hemos podido iniciar el análisis.", response.status >= 500);
      }

      // Lee los eventos (una línea JSON por evento) a medida que llegan.
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
          const event = JSON.parse(line) as AnalyzeEvent;
          if (event.type === "stage") setStage(event.stage);
          else if (event.type === "error") throw new AnalyzeError(event.message, event.retryable);
          else {
            setState({
              step: "report",
              photo,
              upload: blob,
              report: event.report,
              warnings: event.warnings,
              meta: event.meta,
            });
            return;
          }
        }
      }
      throw new AnalyzeError("La conexión se ha cortado antes de terminar el análisis.", true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ClientImageError) {
        setPreview(null);
        setState({ step: "capture", error: error.message });
      } else if (error instanceof AnalyzeError) {
        setState({ step: "error", photo, message: error.message, retryable: error.retryable });
      } else {
        setState({ step: "error", photo, message: "No hemos podido conectar con el servidor.", retryable: true });
      }
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]"
            aria-label="Volver al inicio"
          >
            <Mark />
            Electronics Diagnostic
          </button>
          {testMode && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-text-tertiary">
              Modo de pruebas
            </span>
          )}
        </div>
      </header>

      <main>
        {state.step === "capture" && <CaptureStep onFile={choosePhoto} error={state.error} />}

        {state.step === "prepare" && (
          <PrepareStep
            previewUrl={state.photo.previewUrl}
            initial={options}
            testMode={testMode}
            onAnalyze={(opts) => analyze(state.photo, opts)}
            onChangePhoto={reset}
          />
        )}

        {state.step === "analyzing" && (
          <AnalyzingStep
            previewUrl={state.photo.previewUrl}
            stage={state.stage}
            onCancel={() => {
              abortRef.current?.abort();
              setState({ step: "prepare", photo: state.photo });
            }}
          />
        )}

        {state.step === "report" && (
          <ReportView
            report={state.report}
            warnings={state.warnings}
            meta={state.meta}
            previewUrl={state.photo.previewUrl}
            upload={state.upload}
            level={options.level}
            onNewAnalysis={reset}
          />
        )}

        {state.step === "error" && (
          <section className="animate-enter mx-auto flex max-w-md flex-col items-center px-4 pt-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
              <RotateCcw className="size-6" strokeWidth={1.75} />
            </div>
            <h1 className="mt-6 font-display text-[24px] font-semibold tracking-[-0.01em]">
              No se ha completado el análisis
            </h1>
            <p role="alert" className="mt-2 text-[15px] leading-relaxed text-text-secondary">
              {state.message}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {state.retryable && <Button onClick={() => analyze(state.photo, options)}>Reintentar</Button>}
              <Button variant="secondary" onClick={reset}>
                Elegir otra foto
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Marca: un chip estilizado, sin texto ni degradados.
function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" fill="currentColor" />
      <path
        d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
