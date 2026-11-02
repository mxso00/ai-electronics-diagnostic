"use client";

import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Foto del análisis con vista ampliada. Al ampliar, la imagen se dibuja más
// grande dentro de un contenedor con desplazamiento, así que se puede
// recorrer arrastrando en el móvil o con la rueda en escritorio.
// La vista ampliada se monta en <body> con un portal: dentro del informe, la
// animación de entrada crea un contexto que rompería el position: fixed.
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  // Punto de la foto (en fracciones de 0 a 1) que queda centrado al ampliar.
  const focus = useRef({ x: 0.5, y: 0.5 });
  const scrollerRef = useRef<HTMLDivElement>(null);

  const toggleZoom = (point = { x: 0.5, y: 0.5 }) => {
    focus.current = point;
    setZoomed((z) => !z);
  };

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!zoomed || !scroller) return;
    scroller.scrollLeft = focus.current.x * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = focus.current.y * scroller.scrollHeight - scroller.clientHeight / 2;
  }, [zoomed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setZoomed(false);
          setOpen(true);
        }}
        className="group relative block w-full overflow-hidden rounded-[24px] border border-border bg-surface shadow-card outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
        aria-label="Ampliar la foto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
        <img src={src} alt={alt} className="max-h-[420px] w-full object-contain" />
        <span className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
          <Maximize2 className="size-4" />
        </span>
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Foto ampliada"
            className="fixed inset-0 z-50 bg-black/92 backdrop-blur-sm"
          >
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button
                type="button"
                onClick={() => toggleZoom()}
                className="flex size-10 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20"
                aria-label={zoomed ? "Reducir" : "Ampliar"}
              >
                {zoomed ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>
            <div
              ref={scrollerRef}
              className={`h-full w-full overflow-auto ${zoomed ? "" : "flex items-center justify-center p-4 sm:p-10"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img
                src={src}
                alt={alt}
                onClick={(e) => {
                  const img = e.currentTarget;
                  toggleZoom({
                    x: e.nativeEvent.offsetX / img.clientWidth,
                    y: e.nativeEvent.offsetY / img.clientHeight,
                  });
                }}
                className={
                  zoomed
                    ? "max-w-none w-[250%] cursor-zoom-out sm:w-[200%]"
                    : "max-h-full max-w-full cursor-zoom-in object-contain"
                }
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
