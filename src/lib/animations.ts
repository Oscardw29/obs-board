import type React from "react";
import type {
  AnimationEasing,
  ElementAnimationConfig,
  EntranceAnimation,
  ExitAnimation,
  LoopAnimation,
  StylePreset,
} from "@/types/board";

export const ENTRANCE_ANIMATIONS: Array<{
  id: EntranceAnimation;
  label: string;
}> = [
  { id: "none", label: "Sin entrada" },
  { id: "fadeIn", label: "Desvanecer" },
  { id: "popIn", label: "Pop elástico" },
  { id: "slideUp", label: "Deslizar arriba" },
  { id: "slideDown", label: "Deslizar abajo" },
  { id: "slideLeft", label: "Desde derecha" },
  { id: "slideRight", label: "Desde izquierda" },
  { id: "zoomBounce", label: "Zoom rebote" },
  { id: "spinIn", label: "Giro suave" },
  { id: "blurIn", label: "Enfoque" },
  { id: "flipIn", label: "Volteo 3D" },
];

export const LOOP_ANIMATIONS: Array<{ id: LoopAnimation; label: string }> = [
  { id: "none", label: "Sin bucle" },
  { id: "float", label: "Flotar" },
  { id: "pulse", label: "Pulso" },
  { id: "glowPulse", label: "Resplandor" },
  { id: "wiggle", label: "Oscilar" },
  { id: "spinSlow", label: "Rotación continua" },
  { id: "bounce", label: "Rebote" },
  { id: "shake", label: "Vibrar" },
  { id: "heartbeat", label: "Latido" },
  { id: "rainbowHue", label: "Ciclo cromático" },
];

export const EXIT_ANIMATIONS: Array<{ id: ExitAnimation; label: string }> = [
  { id: "none", label: "Sin salida" },
  { id: "fadeOut", label: "Desvanecer" },
  { id: "popOut", label: "Encoger" },
  { id: "slideUpOut", label: "Salir arriba" },
  { id: "slideDownOut", label: "Salir abajo" },
  { id: "slideLeftOut", label: "Salir izquierda" },
  { id: "slideRightOut", label: "Salir derecha" },
  { id: "blurOut", label: "Desenfoque" },
];

export const EASING_OPTIONS: Array<{ id: AnimationEasing; label: string }> = [
  { id: "cubic-bezier(0.23, 1, 0.32, 1)", label: "Suave Pro" },
  { id: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Rebote" },
  { id: "ease-out", label: "Ease Out" },
  { id: "ease-in-out", label: "Simétrico" },
  { id: "linear", label: "Lineal" },
];

const ENTRANCE_KEYFRAMES: Record<EntranceAnimation, string> = {
  none: "",
  fadeIn: "obFadeIn",
  popIn: "obPopIn",
  slideUp: "obSlideUp",
  slideDown: "obSlideDown",
  slideLeft: "obSlideLeft",
  slideRight: "obSlideRight",
  zoomBounce: "obZoomBounce",
  spinIn: "obSpinIn",
  blurIn: "obBlurIn",
  flipIn: "obFlipIn",
};

const LOOP_KEYFRAMES: Record<LoopAnimation, string> = {
  none: "",
  float: "obFloat",
  pulse: "obPulse",
  glowPulse: "obGlowPulse",
  wiggle: "obWiggle",
  spinSlow: "obSpinSlow",
  bounce: "obBounce",
  shake: "obShake",
  heartbeat: "obHeartbeat",
  rainbowHue: "obRainbowHue",
};

const EXIT_KEYFRAMES: Record<ExitAnimation, string> = {
  none: "",
  fadeOut: "obFadeOut",
  popOut: "obPopOut",
  slideUpOut: "obSlideUpOut",
  slideDownOut: "obSlideDownOut",
  slideLeftOut: "obSlideLeftOut",
  slideRightOut: "obSlideRightOut",
  blurOut: "obBlurOut",
};

export function buildAnimationStyle(
  config: ElementAnimationConfig | undefined,
  phase: "enter" | "exit"
): React.CSSProperties {
  if (!config) return {};

  const intensity = Math.min(2, Math.max(0.3, config.intensity ?? 1));
  const style: Record<string, string | number> = {
    "--anim-amp": intensity,
  };

  if (phase === "exit") {
    const exitKey = config.exit ?? "none";
    const kf = EXIT_KEYFRAMES[exitKey];
    if (!kf) return style as React.CSSProperties;
    const dur = Math.max(120, config.exitDurationMs ?? 320);
    return {
      ...style,
      animation: `${kf} ${dur}ms cubic-bezier(0.23, 1, 0.32, 1) forwards`,
    } as React.CSSProperties;
  }

  const parts: string[] = [];
  const entrance = config.entrance ?? "none";
  const entranceKf = ENTRANCE_KEYFRAMES[entrance];
  const entranceDur = Math.max(120, config.entranceDurationMs ?? 450);
  const entranceDelay = Math.max(0, config.entranceDelayMs ?? 0);
  const easing = config.entranceEasing ?? "cubic-bezier(0.23, 1, 0.32, 1)";

  if (entranceKf) {
    parts.push(`${entranceKf} ${entranceDur}ms ${easing} ${entranceDelay}ms both`);
  }

  const loop = config.loop ?? "none";
  const loopKf = LOOP_KEYFRAMES[loop];
  if (loopKf) {
    const loopDur = Math.max(400, config.loopDurationMs ?? 2400);
    const loopDelay = entranceKf ? entranceDur + entranceDelay : 0;
    const loopEase = loop === "spinSlow" || loop === "rainbowHue" ? "linear" : "ease-in-out";
    parts.push(`${loopKf} ${loopDur}ms ${loopEase} ${loopDelay}ms infinite`);
  }

  if (parts.length > 0) {
    style.animation = parts.join(", ");
  }

  return style as React.CSSProperties;
}

export const BUILT_IN_PRESETS: StylePreset[] = [
  {
    id: "preset_broadcast_blue",
    name: "OBoardS Azul",
    builtIn: true,
    category: "universal",
    style: {
      strokeColor: "#38bdf8",
      fillColor: "rgba(14, 165, 233, 0.16)",
      strokeWidth: 5,
      strokeStyle: "solid",
      borderRadius: 18,
      brushType: "neon",
      textColor: "#f0f9ff",
      textBgColor: "rgba(9, 11, 16, 0.84)",
      textShadow: true,
      animation: {
        entrance: "popIn",
        entranceDurationMs: 420,
        loop: "glowPulse",
        loopDurationMs: 2600,
        exit: "fadeOut",
        exitDurationMs: 260,
        intensity: 1,
      },
    },
  },
  {
    id: "preset_alert_live",
    name: "Alerta Directo",
    builtIn: true,
    category: "universal",
    style: {
      strokeColor: "#f43f5e",
      fillColor: "rgba(244, 63, 94, 0.2)",
      strokeWidth: 6,
      strokeStyle: "solid",
      borderRadius: 16,
      brushType: "marker",
      textColor: "#ffffff",
      textBgColor: "rgba(190, 18, 60, 0.88)",
      textShadow: true,
      animation: {
        entrance: "zoomBounce",
        entranceDurationMs: 520,
        loop: "pulse",
        loopDurationMs: 1600,
        exit: "popOut",
        exitDurationMs: 240,
        intensity: 1,
      },
    },
  },
  {
    id: "preset_glass_pill",
    name: "Pastilla Cristal",
    builtIn: true,
    category: "text",
    style: {
      strokeColor: "#e2e8f0",
      fillColor: "rgba(16, 19, 28, 0.78)",
      strokeWidth: 3,
      borderRadius: 20,
      fontFamily: "Plus Jakarta Sans",
      textColor: "#f8fafc",
      textBgColor: "rgba(16, 19, 28, 0.82)",
      textBorderRadius: 16,
      textShadow: false,
      animation: {
        entrance: "slideUp",
        entranceDurationMs: 380,
        loop: "none",
        exit: "slideDownOut",
        exitDurationMs: 260,
        intensity: 0.9,
      },
    },
  },
  {
    id: "preset_chalk_sketch",
    name: "Tiza Pizarra",
    builtIn: true,
    category: "brush",
    style: {
      strokeColor: "#fde047",
      fillColor: "transparent",
      strokeWidth: 8,
      brushType: "chalk",
      fontFamily: "Caveat",
      textColor: "#fef08a",
      textBgColor: "transparent",
      textShadow: true,
      animation: {
        entrance: "fadeIn",
        entranceDurationMs: 350,
        loop: "float",
        loopDurationMs: 3000,
        exit: "fadeOut",
        exitDurationMs: 250,
        intensity: 0.8,
      },
    },
  },
  {
    id: "preset_highlighter_gold",
    name: "Resaltador Oro",
    builtIn: true,
    category: "brush",
    style: {
      strokeColor: "#facc15",
      strokeWidth: 16,
      brushType: "highlighter",
      opacity: 0.85,
    },
  },
  {
    id: "preset_impact_title",
    name: "Título Impacto",
    builtIn: true,
    category: "text",
    style: {
      fontFamily: "Bebas Neue",
      fontSize: 72,
      fontWeight: "bold",
      textColor: "#ffffff",
      textStrokeColor: "#090b10",
      textStrokeWidth: 3,
      textBgColor: "transparent",
      textShadow: true,
      letterSpacing: 2,
      animation: {
        entrance: "slideRight",
        entranceDurationMs: 420,
        loop: "none",
        exit: "slideLeftOut",
        exitDurationMs: 280,
        intensity: 1,
      },
    },
  },
];
