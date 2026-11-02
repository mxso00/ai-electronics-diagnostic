"use client";

import { Camera, ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

export function CaptureStep({ onFile, error }: { onFile: (file: File) => void; error?: string }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // El botón de cámara solo tiene sentido en dispositivos táctiles: en
  // escritorio el atributo capture se ignora y abriría el mismo selector.
  const [hasCamera, setHasCamera] = useState(false);
  useEffect(() => {
    setHasCamera(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <section className="animate-enter mx-auto flex max-w-2xl flex-col items-center px-4 pt-10 text-center sm:pt-20">
      <h1 className="font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[56px]">
        Entiende lo que
        <br />
        tienes delante.
      </h1>
      <p className="mt-5 max-w-md text-[17px] leading-relaxed text-text-secondary">
        Haz una foto de un componente o de una placa. Te decimos qué es, en qué estado parece estar y cómo comprobarlo.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
        className={`mt-10 w-full rounded-[28px] border bg-surface px-6 py-12 shadow-card transition-all duration-200 sm:py-16 ${
          dragging ? "scale-[1.01] border-accent ring-4 ring-accent-soft" : "border-border"
        }`}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <ImageUp className="size-6" strokeWidth={1.75} />
        </div>
        <p className="mt-5 text-[17px] font-medium">
          {hasCamera ? "Haz una foto o elige una imagen" : "Arrastra una foto aquí"}
        </p>
        <p className="mt-1 text-[14px] text-text-tertiary">JPEG, PNG o WebP</p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {hasCamera && (
            <Button onClick={() => cameraRef.current?.click()} className="w-full sm:w-auto">
              <Camera className="size-[18px]" strokeWidth={2} />
              Hacer foto
            </Button>
          )}
          <Button
            variant={hasCamera ? "secondary" : "primary"}
            onClick={() => pickerRef.current?.click()}
            className="w-full sm:w-auto"
          >
            Elegir imagen
          </Button>
        </div>

        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[14px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-8 max-w-sm text-[13px] leading-relaxed text-text-tertiary">
        Para un mejor resultado: buena luz, sin reflejos y con las serigrafías o etiquetas a la vista.
      </p>
    </section>
  );
}
