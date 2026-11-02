"use client";

import { AlertTriangle, Camera, Info, ShieldAlert, Wrench, Zap } from "lucide-react";
import type { ChatTurn } from "@/core/chat-types";
import type { AnalysisReport, UserLevel } from "@/core/report-schema";
import type { AnalysisMeta, SafetyWarning } from "@/lib/api-types";
import { CATEGORY_LABEL, CONFIDENCE_LABEL, DIFFICULTY_LABEL, STATUS } from "@/lib/labels";
import { ChatPanel } from "./ChatPanel";
import { ImageViewer } from "./ImageViewer";
import { Button, Card, Pill, SectionTitle, type Tone } from "./ui";

const CONFIDENCE_TONE: Record<AnalysisReport["identification"]["confidence"], Tone> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

// El informe solo muestra las secciones que tienen contenido real.
export function ReportView({
  report,
  warnings,
  meta,
  previewUrl,
  upload,
  level,
  createdAt,
  saved,
  conversation,
  onConversationChange,
  onNewAnalysis,
}: {
  report: AnalysisReport;
  warnings: SafetyWarning[];
  meta: AnalysisMeta;
  previewUrl: string;
  upload: Blob;
  level: UserLevel;
  createdAt: number;
  saved: boolean;
  conversation: ChatTurn[];
  onConversationChange: (conversation: ChatTurn[]) => void;
  onNewAnalysis: () => void;
}) {
  const id = report.identification;
  const status = STATUS[report.diagnosis.status];
  const isElectronics = report.image_assessment.shows_electronics;
  const modelLine = [id.manufacturer, id.model].filter(Boolean).join(" ");

  return (
    <article className="animate-enter mx-auto max-w-5xl px-4 pt-6 pb-24 sm:pt-12">
      {/* Identificación */}
      <header className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
        <ImageViewer src={previewUrl} alt={id.name} />
        <div className="flex flex-col justify-center">
          <p className="text-[13px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
            {CATEGORY_LABEL[id.category]}
          </p>
          <h1 className="mt-2 font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] sm:text-[40px]">
            {id.name}
          </h1>
          {isElectronics && (
            <p className="mt-2 text-[17px] text-text-secondary">{modelLine || "Modelo no identificado"}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={CONFIDENCE_TONE[id.confidence]}>{CONFIDENCE_LABEL[id.confidence]}</Pill>
            {isElectronics && <Pill tone={status.tone === "neutral" ? "neutral" : status.tone}>{status.label}</Pill>}
          </div>
          <p className="mt-6 text-[17px] leading-relaxed">{report.summary}</p>
          {report.function_description && (
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">{report.function_description}</p>
          )}
          {id.visible_markings.length > 0 && (
            <p className="mt-4 text-[13px] text-text-tertiary">
              Texto leído en la foto:{" "}
              {id.visible_markings.map((m, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <span className="font-mono text-text-secondary">{m}</span>
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      {(report.image_assessment.quality === "poor" || report.image_assessment.issues.length > 0) && (
        <Notice icon={<Camera className="size-[18px]" />} tone="neutral" className="mt-8">
          <strong className="font-medium">La foto limita el análisis.</strong>{" "}
          {report.image_assessment.issues.map((issue) => issue.trim().replace(/\.?$/, ".")).join(" ")}
        </Notice>
      )}

      {warnings.length > 0 && (
        <section className="mt-10 space-y-3" aria-label="Seguridad">
          {warnings.map((w) => (
            <Notice
              key={w.id}
              tone={w.level === "danger" ? "danger" : "warning"}
              icon={w.level === "danger" ? <Zap className="size-[18px]" /> : <ShieldAlert className="size-[18px]" />}
            >
              {w.text}
            </Notice>
          ))}
          {report.safety.notes && <p className="px-1 text-[14px] text-text-secondary">{report.safety.notes}</p>}
        </section>
      )}

      <div className="mt-14 space-y-14">
        {report.observations.length > 0 && (
          <section>
            <SectionTitle eyebrow="Análisis visual" title="Lo que se ve" />
            <Card className="divide-y divide-border">
              {report.observations.map((o, i) => (
                <div key={i} className="flex gap-4 px-5 py-4 sm:px-6">
                  <span
                    className={`mt-2 size-2 shrink-0 rounded-full ${o.kind === "anomaly" ? "bg-warning" : "bg-border-strong"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-relaxed">
                      {o.description}
                      {o.kind === "anomaly" && (
                        <span className="ml-2 align-middle">
                          <Pill tone="warning">Anomalía</Pill>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] text-text-tertiary">{o.location}</p>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {isElectronics && (
          <section>
            <SectionTitle eyebrow="Diagnóstico" title={status.label} />
            {report.diagnosis.hypotheses.length > 0 && (
              <div className="grid gap-3">
                {report.diagnosis.hypotheses.map((h, i) => (
                  <Card key={i} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-[17px] font-semibold">{h.fault}</h3>
                      <Pill tone="neutral">{CONFIDENCE_LABEL[h.confidence]}</Pill>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{h.reasoning}</p>
                    {h.possible_causes.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[13px] font-medium text-text-tertiary">Causas posibles</p>
                        <ul className="mt-1.5 space-y-1 text-[15px]">
                          {h.possible_causes.map((c, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-text-tertiary">–</span>
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
            <Notice icon={<Info className="size-[18px]" />} tone="neutral" className="mt-3">
              <strong className="font-medium">Lo que una foto no puede mostrar.</strong> {report.diagnosis.limitations}
            </Notice>
          </section>
        )}

        {report.checks.length > 0 && (
          <section>
            <SectionTitle eyebrow="Siguiente paso" title="Cómo comprobarlo" />
            <ol className="grid gap-3">
              {report.checks.map((c, i) => (
                <li key={i}>
                  <Card className="flex gap-4 p-5 sm:p-6">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-relaxed font-medium">{c.action}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">{c.purpose}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Pill tone="neutral">{DIFFICULTY_LABEL[c.difficulty]}</Pill>
                        {c.requires_power && (
                          <Pill tone="danger">
                            <Zap className="size-3" /> Con el equipo encendido
                          </Pill>
                        )}
                        {c.tools.length > 0 && (
                          <span className="text-[13px] text-text-tertiary">
                            <Wrench className="mr-1 inline size-3.5 align-[-2px]" />
                            {c.tools.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(report.solutions.length > 0 || report.professional_help.recommended) && (
          <section>
            <SectionTitle eyebrow="Solución" title="Qué se puede hacer" />
            {report.solutions.length > 0 && (
              <Card className="divide-y divide-border">
                {report.solutions.map((s, i) => (
                  <div key={i} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-[15px] leading-relaxed font-medium">{s.action}</p>
                      <Pill tone="neutral">{DIFFICULTY_LABEL[s.difficulty]}</Pill>
                    </div>
                    <p className="mt-1 text-[14px] text-text-secondary">{s.when}</p>
                  </div>
                ))}
              </Card>
            )}
            {report.professional_help.recommended && (
              <Notice icon={<AlertTriangle className="size-[18px]" />} tone="warning" className="mt-3">
                <strong className="font-medium">Recomendamos acudir a un técnico.</strong>{" "}
                {report.professional_help.reason}
              </Notice>
            )}
          </section>
        )}

        {report.specifications.length > 0 && (
          <section>
            <SectionTitle eyebrow="Datos técnicos" title="Especificaciones" />
            <Card className="divide-y divide-border">
              {report.specifications.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3.5 sm:px-6"
                >
                  <span className="text-[14px] text-text-secondary">{s.name}</span>
                  <span className="flex items-center gap-2 text-[15px] font-medium">
                    {s.value}
                    <span
                      className="text-[12px] font-normal text-text-tertiary"
                      title={
                        s.source === "visible_marking"
                          ? "Leído en el propio componente"
                          : "Dato conocido del modelo identificado, sin verificar con documentación"
                      }
                    >
                      {s.source === "visible_marking" ? "impreso" : "del modelo"}
                    </span>
                  </span>
                </div>
              ))}
            </Card>
            <p className="mt-2 px-1 text-[13px] text-text-tertiary">
              «Del modelo» indica un dato conocido para ese modelo que todavía no hemos verificado con documentación
              oficial.
            </p>
          </section>
        )}

        {report.follow_up.length > 0 && (
          <section>
            <SectionTitle eyebrow="Mejorar el análisis" title="Una foto más ayudaría" />
            <Card className="p-5 sm:p-6">
              <ul className="space-y-2.5">
                {report.follow_up.map((f, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <Camera className="mt-1 size-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" onClick={onNewAnalysis} className="mt-5">
                Analizar otra foto
              </Button>
            </Card>
          </section>
        )}
      </div>

      {isElectronics && (
        <div className="mt-14">
          <ChatPanel
            report={report}
            level={level}
            photo={upload}
            initialMessages={conversation}
            onMessagesChange={onConversationChange}
          />
        </div>
      )}

      <footer className="mt-16 border-t border-border pt-6 text-[13px] leading-relaxed text-text-tertiary">
        <p>
          Diagnóstico visual orientativo. Una foto no permite confirmar averías eléctricas ni garantizar que un equipo
          sea seguro o funcione.
        </p>
        <p className="mt-1">
          Analizado con {meta.modelLabel} en {Math.round(meta.latencyMs / 1000)} s ·{" "}
          {new Date(createdAt).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}.{" "}
          {saved
            ? "Guardado en el historial de este dispositivo."
            : "Este navegador no permite guardarlo en el historial."}
        </p>
        <Button onClick={onNewAnalysis} className="mt-6">
          Nuevo análisis
        </Button>
      </footer>
    </article>
  );
}

function Notice({
  tone,
  icon,
  className = "",
  children,
}: {
  tone: "danger" | "warning" | "neutral";
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-surface-muted border border-border text-text-secondary",
  };
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3.5 text-[14px] leading-relaxed ${tones[tone]} ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className={tone === "neutral" ? "" : "text-text"}>{children}</p>
    </div>
  );
}
