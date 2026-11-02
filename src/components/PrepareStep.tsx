"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { AnalysisGoal, UserLevel } from "@/core/report-schema";
import { MAX_CONTEXT_CHARS } from "@/lib/api-types";
import { GOALS, LEVELS } from "@/lib/labels";
import { Button } from "./ui";

export interface AnalysisOptions {
  goal: AnalysisGoal;
  level: UserLevel;
  context: string;
}

export function PrepareStep({
  previewUrl,
  initial,
  testMode,
  onAnalyze,
  onChangePhoto,
}: {
  previewUrl: string;
  initial: AnalysisOptions;
  testMode: boolean;
  onAnalyze: (options: AnalysisOptions) => void;
  onChangePhoto: () => void;
}) {
  const [options, setOptions] = useState(initial);
  const set = <K extends keyof AnalysisOptions>(key: K, value: AnalysisOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  return (
    <section className="animate-enter mx-auto grid max-w-5xl gap-8 px-4 pt-6 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div>
        <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
          <img src={previewUrl} alt="Foto seleccionada" className="max-h-[56vh] w-full object-contain" />
        </div>
        <button
          type="button"
          onClick={onChangePhoto}
          className="mt-3 text-[14px] font-medium text-accent hover:underline"
        >
          Cambiar foto
        </button>
      </div>

      <div className="flex flex-col">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-[-0.02em]">¿Qué quieres saber?</h1>

        <fieldset className="mt-6">
          <legend className="sr-only">Objetivo del análisis</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {GOALS.map((goal) => {
              const selected = options.goal === goal.value;
              return (
                <label
                  key={goal.value}
                  className={`cursor-pointer rounded-2xl border px-4 py-3 transition-all duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent-soft ${
                    selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="goal"
                    value={goal.value}
                    checked={selected}
                    onChange={() => set("goal", goal.value)}
                    className="sr-only"
                  />
                  <span className={`block text-[15px] font-medium ${selected ? "text-accent" : ""}`}>{goal.label}</span>
                  <span className="block text-[13px] text-text-tertiary">{goal.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-7 block">
          <span className="text-[14px] font-medium">
            ¿Qué le pasa? <span className="font-normal text-text-tertiary">(opcional)</span>
          </span>
          <textarea
            value={options.context}
            onChange={(e) => set("context", e.target.value)}
            maxLength={MAX_CONTEXT_CHARS}
            rows={3}
            placeholder="Ej.: el ordenador no arranca y huele a quemado"
            className="mt-2 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] placeholder:text-text-tertiary focus:border-accent focus:ring-4 focus:ring-accent-soft focus:outline-none"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-[14px] font-medium">Tu nivel</legend>
          <div className="mt-2 inline-flex rounded-full border border-border bg-surface-muted p-1">
            {LEVELS.map((level) => {
              const selected = options.level === level.value;
              return (
                <label
                  key={level.value}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-[14px] transition-all duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent-soft ${
                    selected ? "bg-surface font-medium shadow-card" : "text-text-secondary hover:text-text"
                  }`}
                >
                  <input
                    type="radio"
                    name="level"
                    value={level.value}
                    checked={selected}
                    onChange={() => set("level", level.value)}
                    className="sr-only"
                  />
                  {level.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Button
          onClick={() => onAnalyze(options)}
          className="mt-8 h-12 w-full text-[16px] sm:w-auto sm:self-start sm:px-8"
        >
          Analizar
          <ArrowRight className="size-[18px]" strokeWidth={2} />
        </Button>

        <p className="mt-4 text-[13px] leading-relaxed text-text-tertiary">
          Antes de enviarla quitamos la ubicación y los metadatos de la foto. No la guardamos.
          {testMode && " En este modo de pruebas el proveedor de IA puede usar las imágenes para mejorar sus modelos."}
        </p>
      </div>
    </section>
  );
}
