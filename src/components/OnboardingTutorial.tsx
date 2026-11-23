"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

interface OnboardingTutorialProps {
  open: boolean;
  onClose: () => void;
}

interface TutorialStep {
  title: string;
  description: string;
  targetSelector?: string;
}

const STEPS: TutorialStep[] = [
  {
    title: "Bienvenido a tu estudio en vivo",
    description:
      "Todo lo que dibujes o coloques dentro del marco 1920×1080 aparecerá en OBS Studio con fondo 100% transparente. Usa Espacio + arrastrar o la rueda del mouse para navegar.",
    targetSelector: '[data-tour="stage"]',
  },
  {
    title: "Selección múltiple, Borrador y Pinceles",
    description:
      "Con V puedes arrastrar una caja para seleccionar varios objetos (o usar Shift/Ctrl). Usa E para el borrador (objeto o parcial), P para elegir entre 8 tipos de pincel, y el ícono de documento para adjuntar PDFs.",
    targetSelector: '[data-tour="toolbar"]',
  },
  {
    title: "Imán inteligente y Líneas Guías",
    description:
      "El imán (M) viene activado por defecto para alinear objetos al borde o centro suavemente como en Canva. Pulsa G para mostrar u ocultar las líneas guías del tablero.",
    targetSelector: '[data-tour="snap-guides"]',
  },
  {
    title: "Capas y Biblioteca Compartida a la izquierda",
    description:
      "A la izquierda tienes tus Capas (con miniatura real de cada trazo y quién lo colocó) y la Biblioteca compartida donde puedes crear carpetas de colores y arrastrar archivos.",
    targetSelector: '[data-tour="left-dock"]',
  },
  {
    title: "Estilos, Fuentes y Animaciones a la derecha",
    description:
      "La pestaña Estilo aparece primero por defecto para ajustar colores, grosor, fuentes (e importar tus .ttf/.woff2), animaciones de entrada/bucle/salida y presets.",
    targetSelector: '[data-tour="right-dock"]',
  },
  {
    title: "Control de colaboradores y salida OBS",
    description:
      "Desde arriba puedes ver quién está conectado o desconectado, pausar al instante a un colaborador, cambiar sus permisos o expulsarlo, y copiar tu enlace directo para OBS.",
    targetSelector: '[data-tour="collaborators"]',
  },
];

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  open,
  onClose,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      return;
    }

    const measure = () => {
      const sel = STEPS[stepIdx]?.targetSelector;
      if (!sel) {
        setRect(null);
        return;
      }
      const el = document.querySelector(sel);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, stepIdx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
        else onClose();
      }
      if (e.key === "ArrowLeft" && stepIdx > 0) {
        setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stepIdx, onClose]);

  if (!open) return null;

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Spotlight highlight box */}
      {rect && (
        <div
          className="pointer-events-none fixed rounded-2xl border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(9,11,16,0.48),0_0_28px_rgba(56,189,248,0.55)] transition-[left,top,width,height] duration-300"
          style={{
            left: Math.max(4, rect.left - 6),
            top: Math.max(4, rect.top - 6),
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tutorial Card */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl bg-studio-900 border border-white/[0.14] shadow-2xl p-5 space-y-4 animate-modal-enter"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs text-sky-300 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Guía rápida</span>
              <BrandLogo size="sm" />
            </div>
            <h3 className="text-base font-bold text-white">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar tutorial"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          {step.description}
        </p>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Ir al paso ${idx + 1}`}
                onClick={() => setStepIdx(idx)}
                className={`h-1.5 rounded-full transition-[width,background-color] ${
                  idx === stepIdx
                    ? "w-5 bg-sky-400"
                    : "w-1.5 bg-studio-700 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Saltar
            </button>
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => i - 1)}
                className="px-3 py-1.5 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-xs text-zinc-200 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Atrás</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) onClose();
                else setStepIdx((i) => i + 1);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors"
            >
              <span>{isLast ? "¡Entendido!" : "Siguiente"}</span>
              {!isLast && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
