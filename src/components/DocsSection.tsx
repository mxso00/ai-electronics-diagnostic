"use client";

import { BadgeCheck, ExternalLink, FileSearch } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DocsResult, DocType } from "@/core/docs/types";
import type { AnalysisReport } from "@/core/report-schema";
import { Card, Pill, SectionTitle } from "./ui";

const TYPE_LABEL: Record<DocType, string> = {
  manual: "Manual",
  product: "Página del producto",
  specs: "Especificaciones",
  firmware: "BIOS, firmware y descargas",
  support: "Soporte",
  datasheet: "Hoja de datos",
  other: "Documento",
};

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; docs: DocsResult }
  | { status: "error"; message: string };

// Solo se busca documentación del modelo exacto identificado con confianza
// alta: buscar con un modelo dudoso devolvería manuales de otro producto.
export function canSearchDocs(report: AnalysisReport) {
  const id = report.identification;
  return Boolean(report.documentation_query && id.model && id.confidence === "high");
}

export function DocsSection({
  report,
  initialDocs,
  autoSearch,
  onDocsChange,
}: {
  report: AnalysisReport;
  initialDocs?: DocsResult;
  autoSearch: boolean;
  onDocsChange: (docs: DocsResult) => void;
}) {
  const id = report.identification;
  const eligible = canSearchDocs(report);
  const [search, setSearch] = useState<Search>(
    initialDocs ? { status: "done", docs: initialDocs } : { status: "idle" },
  );

  const run = useCallback(async () => {
    setSearch({ status: "loading" });
    try {
      const response = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manufacturer: id.manufacturer, model: id.model }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No hemos podido buscar la documentación.");
      setSearch({ status: "done", docs: data as DocsResult });
      onDocsChange(data as DocsResult);
    } catch (error) {
      setSearch({
        status: "error",
        message: error instanceof Error ? error.message : "No hemos podido buscar la documentación.",
      });
    }
  }, [id.manufacturer, id.model, onDocsChange]);

  useEffect(() => {
    if (eligible && autoSearch && !initialDocs) void run();
    // Solo al mostrar el informe por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!eligible) {
    // Sin modelo exacto no buscamos; si al menos hay fabricante, explicamos qué falta.
    if (!report.image_assessment.shows_electronics || !id.manufacturer) return null;
    return (
      <section>
        <SectionTitle eyebrow="Documentación" title="Manuales y documentación técnica" />
        <Card className="flex gap-4 p-5 sm:p-6">
          <FileSearch className="mt-0.5 size-5 shrink-0 text-text-tertiary" />
          <p className="text-[15px] leading-relaxed text-text-secondary">
            Para buscar el manual necesitamos el modelo exacto, y en esta foto no se identifica con seguridad. Una foto
            de la etiqueta o de la serigrafía con el modelo permitiría buscarlo.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle eyebrow="Documentación" title="Manuales y documentación técnica" />

      {search.status === "idle" && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <p className="text-[15px] text-text-secondary">
            Busca el manual y la documentación oficial de {[id.manufacturer, id.model].filter(Boolean).join(" ")}.
          </p>
          <button
            type="button"
            onClick={run}
            className="rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-white hover:bg-accent-hover"
          >
            Buscar documentación
          </button>
        </Card>
      )}

      {search.status === "loading" && (
        <div aria-live="polite">
          <p className="mb-3 text-[14px] text-text-tertiary">
            <span className="animate-breathe">Buscando documentación oficial y comprobando los enlaces…</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="animate-breathe h-[132px] rounded-3xl border border-border bg-surface" />
            ))}
          </div>
        </div>
      )}

      {search.status === "error" && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <p role="alert" className="text-[15px] text-danger">
            {search.message}
          </p>
          <button type="button" onClick={run} className="text-[14px] font-medium text-accent hover:underline">
            Reintentar
          </button>
        </Card>
      )}

      {search.status === "done" && search.docs.links.length === 0 && (
        <Card className="p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed">
            No hemos encontrado documentación que mencione exactamente{" "}
            <span className="font-medium">{search.docs.model}</span>. Preferimos no mostrar manuales de modelos
            parecidos.
          </p>
          {search.docs.officialSite && (
            <a
              href={`https://${search.docs.officialSite}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent hover:underline"
            >
              Buscar en la web oficial ({search.docs.officialSite})
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </Card>
      )}

      {search.status === "done" && search.docs.links.length > 0 && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {search.docs.links.map((link) => (
              <li key={link.url}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="neutral">{TYPE_LABEL[link.type]}</Pill>
                    {link.official ? (
                      <Pill tone="accent">
                        <BadgeCheck className="size-3.5" /> Oficial
                      </Pill>
                    ) : (
                      <span className="text-[12px] text-text-tertiary">Fuente no oficial</span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-2 flex-1 text-[15px] leading-snug font-medium">{link.title}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] text-text-tertiary">{link.domain}</span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-[14px] font-medium transition-colors hover:bg-surface-muted"
                    >
                      Abrir
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[13px] text-text-tertiary">
            Enlaces comprobados el {new Date(search.docs.checkedAt).toLocaleDateString("es-ES", { dateStyle: "long" })}:
            funcionan y mencionan el modelo {search.docs.model}.{" "}
            <button type="button" onClick={run} className="text-accent hover:underline">
              Buscar de nuevo
            </button>
          </p>
        </>
      )}
    </section>
  );
}
