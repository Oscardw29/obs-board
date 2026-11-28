"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
} from "lucide-react";
import { computeWaveformPeaksFromAudioBuffer } from "@/lib/client-media-upload";
import type { BoardElement } from "@/types/board";

export interface AudioControlUpdate {
  playing: boolean;
  /** Only provide when explicitly seeking/restarting; omit for volume/mute/loop/pause-in-place */
  currentTimeSec?: number;
  commit?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
}

// Lightweight live playback time pub/sub so the right-hand inspector tracks live seconds
// without re-rendering BoardEditor or triggering audio seeks.
const liveAudioTimeMap = new Map<string, number>();
const liveAudioTimeListeners = new Map<string, Set<(sec: number) => void>>();

function emitLiveAudioTime(elementId: string, sec: number) {
  liveAudioTimeMap.set(elementId, sec);
  const subs = liveAudioTimeListeners.get(elementId);
  if (subs) {
    for (const cb of subs) cb(sec);
  }
}

export function getLiveAudioTime(elementId: string): number | undefined {
  return liveAudioTimeMap.get(elementId);
}

export function subscribeLiveAudioTime(
  elementId: string,
  cb: (sec: number) => void
): () => void {
  let subs = liveAudioTimeListeners.get(elementId);
  if (!subs) {
    subs = new Set();
    liveAudioTimeListeners.set(elementId, subs);
  }
  subs.add(cb);
  return () => {
    subs?.delete(cb);
    if (subs && subs.size === 0) {
      liveAudioTimeListeners.delete(elementId);
    }
  };
}

interface AudioElementNodeProps {
  element: BoardElement;
  mode: "editor" | "obs" | "thumbnail";
  canEdit?: boolean;
  onAudioControl?: (elementId: string, update: AudioControlUpdate) => void;
  onWaveformDecoded?: (
    elementId: string,
    peaks: number[],
    durationSec?: number
  ) => void;
}

export function formatAudioTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Generates a deterministic fallback waveform when audio peaks are still decoding.
 */
function buildFallbackPeaks(seedStr: string, count = 112): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const rnd = (h >>> 0) / 4294967296;
    const t = i / (count - 1);
    // Natural speech/music envelope bursts
    const env =
      0.22 +
      0.68 * Math.exp(-Math.pow((t - 0.14) / 0.08, 2)) +
      0.52 * Math.exp(-Math.pow((t - 0.67) / 0.11, 2)) +
      0.24 * Math.sin(t * Math.PI * 3) ** 2;
    peaks.push(Number(Math.min(1, Math.max(0.06, env * (0.45 + rnd * 0.55))).toFixed(3)));
  }
  return peaks;
}

/**
 * Builds a continuous oscillating oscilloscope SVG path matching a glowing audio wave.
 */
export function buildOscilloscopePath(
  peaks: number[],
  width: number,
  height: number
): string {
  if (!peaks.length) return "";
  const midY = height / 2;
  const maxAmp = height * 0.43;
  const pts: Array<{ x: number; y: number }> = [];
  const total = peaks.length;
  const stepX = width / Math.max(1, total - 1);

  for (let i = 0; i < total; i++) {
    const x = i * stepX;
    // Alternate positive/negative lobes so the line oscillates cleanly around baseline
    const sign = i % 2 === 0 ? -1 : 1;
    // Slight smooth taper at edges
    const edgeFade =
      i === 0 || i === total - 1
        ? 0.15
        : i === 1 || i === total - 2
          ? 0.55
          : 1;
    const amp = peaks[i] * maxAmp * edgeFade;
    pts.push({ x, y: midY + sign * amp });
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export const AudioElementNode: React.FC<AudioElementNodeProps> = ({
  element,
  mode,
  canEdit = true,
  onAudioControl,
  onWaveformDecoded,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeekIdRef = useRef<string | undefined>(undefined);
  const rafRef = useRef<number | null>(null);
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const lastScrubSendRef = useRef(0);
  const decodedUrlRef = useRef<string | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(
    element.currentTimeSec ?? 0
  );
  const [duration, setDuration] = useState<number>(element.durationSec ?? 0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [decodedPeaks, setDecodedPeaks] = useState<number[] | null>(
    element.waveformPeaks?.length ? element.waveformPeaks : null
  );

  const isPlaying = Boolean(element.playing);
  const isLoop = Boolean(element.loop);
  const volume = Math.min(1, Math.max(0, element.volume ?? 0.85));
  const isMuted =
    mode === "thumbnail" || !element.visible
      ? true
      : Boolean(element.muted);
  const waveColor = element.waveformColor || "#fb923c";

  // Keep decodedPeaks synced if element.waveformPeaks updates externally
  useEffect(() => {
    if (element.waveformPeaks && element.waveformPeaks.length > 0) {
      setDecodedPeaks(element.waveformPeaks);
    }
  }, [element.waveformPeaks]);

  // Decode actual audio waveform in editor if not yet cached
  useEffect(() => {
    if (mode !== "editor" || !element.src) return;
    if (decodedPeaks && decodedPeaks.length > 0) return;
    if (decodedUrlRef.current === element.src) return;
    decodedUrlRef.current = element.src;

    let cancelled = false;
    const decode = async () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;
        const res = await fetch(element.src!);
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        if (cancelled) return;
        const ctx = new AudioCtx();
        try {
          const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
          if (cancelled) return;
          const peaks = computeWaveformPeaksFromAudioBuffer(audioBuf, 128);
          const dur =
            Number.isFinite(audioBuf.duration) && audioBuf.duration > 0
              ? Number(audioBuf.duration.toFixed(1))
              : undefined;
          if (peaks.length > 0) {
            setDecodedPeaks(peaks);
            if (dur) setDuration(dur);
            onWaveformDecoded?.(element.id, peaks, dur);
          }
        } finally {
          void ctx.close().catch(() => {});
        }
      } catch {
        // Fallback peaks will remain displayed
      }
    };
    void decode();
    return () => {
      cancelled = true;
    };
  }, [decodedPeaks, element.id, element.src, mode, onWaveformDecoded]);

  // Sync volume, mute, loop to <audio>
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
    audio.loop = isLoop;
  }, [volume, isMuted, isLoop]);

  // Sync play/pause & remote/explicit seek commands
  useEffect(() => {
    if (mode === "thumbnail") return;
    const audio = audioRef.current;
    if (!audio) return;

    const seekChanged =
      Boolean(element.seekId) && element.seekId !== lastSeekIdRef.current;

    const applySeekIfNeeded = () => {
      if (!seekChanged) return;
      lastSeekIdRef.current = element.seekId;
      if (isScrubbingRef.current) return;

      let targetSec = Math.max(0, element.currentTimeSec ?? 0);
      // In OBS (or remote collaborators), gently compensate short transit latency when playing
      if (mode === "obs" && isPlaying && element.triggeredAt) {
        const elapsed = (Date.now() - element.triggeredAt) / 1000;
        if (elapsed > 0.04 && elapsed < 2.5) {
          targetSec += elapsed;
        }
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        targetSec = Math.min(audio.duration, targetSec);
      }
      if (Math.abs(audio.currentTime - targetSec) > 0.12) {
        try {
          audio.currentTime = targetSec;
        } catch {
          // ignore if metadata not yet loaded
        }
      }
      setCurrentTime(targetSec);
      emitLiveAudioTime(element.id, targetSec);
    };

    const playSafe = () => {
      const p = audio.play();
      if (p) {
        p.catch(() => {
          // OBS Browser Source allows autoplay; regular browsers may require gesture
        });
      }
    };

    if (!element.visible) {
      audio.pause();
      return;
    }

    if (seekChanged) {
      if (audio.readyState >= 1) {
        applySeekIfNeeded();
      } else {
        const onMeta = () => {
          audio.removeEventListener("loadedmetadata", onMeta);
          applySeekIfNeeded();
          if (isPlaying) playSafe();
        };
        audio.addEventListener("loadedmetadata", onMeta);
        if (isPlaying) playSafe();
        return () => audio.removeEventListener("loadedmetadata", onMeta);
      }
    }

    if (isPlaying) {
      playSafe();
    } else {
      audio.pause();
    }
  }, [
    element.id,
    element.seekId,
    element.currentTimeSec,
    element.triggeredAt,
    element.visible,
    isPlaying,
    mode,
  ]);

  // Smooth 60fps progress tracking while playing in editor
  useEffect(() => {
    if (mode !== "editor") return;
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !isScrubbingRef.current) {
        const t = audio.currentTime || 0;
        setCurrentTime(t);
        emitLiveAudioTime(element.id, t);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      }
      if (isPlaying) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [element.id, isPlaying, mode]);

  // Scrubbing helper (works on BOTH waveform visualizer and dedicated slider!)
  const seekToRatio = useCallback(
    (ratio: number, commit: boolean) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      const audio = audioRef.current;
      const totalDur =
        (audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : duration) ||
        element.durationSec ||
        0;
      const nextTime = totalDur > 0 ? Number((clamped * totalDur).toFixed(2)) : 0;

      setCurrentTime(nextTime);
      emitLiveAudioTime(element.id, nextTime);
      if (audio && totalDur > 0) {
        try {
          audio.currentTime = nextTime;
        } catch {
          // ignore
        }
      }

      const now = Date.now();
      if (commit || now - lastScrubSendRef.current > 75) {
        lastScrubSendRef.current = now;
        onAudioControl?.(element.id, {
          playing: isPlaying,
          currentTimeSec: nextTime,
          commit,
        });
      }
    },
    [duration, element.durationSec, element.id, isPlaying, onAudioControl]
  );

  const ratioFromPointer = (
    clientX: number,
    container: HTMLDivElement | null
  ): number => {
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const handleScrubPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (!canEdit || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    seekToRatio(ratioFromPointer(e.clientX, containerRef.current), false);
  };

  const handleScrubPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (!isScrubbingRef.current || !canEdit) return;
    e.stopPropagation();
    seekToRatio(ratioFromPointer(e.clientX, containerRef.current), false);
  };

  const handleScrubPointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (!isScrubbingRef.current) return;
    e.stopPropagation();
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    seekToRatio(ratioFromPointer(e.clientX, containerRef.current), true);
  };

  const togglePlay = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const audio = audioRef.current;
    const totalDur =
      (audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : duration) || 0;
    let cur = audio ? audio.currentTime : currentTime;
    if (!isPlaying && totalDur > 0 && cur >= totalDur - 0.15) {
      cur = 0;
      if (audio) {
        try {
          audio.currentTime = 0;
        } catch {
          // ignore
        }
      }
      setCurrentTime(0);
    }
    onAudioControl?.(element.id, {
      playing: !isPlaying,
      currentTimeSec: Number(cur.toFixed(2)),
      commit: true,
    });
  };

  const handleRestart = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    setCurrentTime(0);
    emitLiveAudioTime(element.id, 0);
    onAudioControl?.(element.id, {
      playing: true,
      currentTimeSec: 0,
      commit: true,
    });
  };

  const handleToggleMute = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    onAudioControl?.(element.id, {
      playing: isPlaying,
      muted: !element.muted,
      commit: true,
    });
  };

  const handleToggleLoop = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    onAudioControl?.(element.id, {
      playing: isPlaying,
      loop: !isLoop,
      commit: true,
    });
  };

  const peaks = useMemo(
    () =>
      decodedPeaks && decodedPeaks.length > 0
        ? decodedPeaks
        : buildFallbackPeaks(element.id, 112),
    [decodedPeaks, element.id]
  );

  const waveViewW = 600;
  const waveViewH = 120;
  const wavePath = useMemo(
    () => buildOscilloscopePath(peaks, waveViewW, waveViewH),
    [peaks]
  );

  const totalDuration = duration || element.durationSec || 0;
  const progress =
    totalDuration > 0 ? Math.min(1, Math.max(0, currentTime / totalDuration)) : 0;
  const progressPct = progress * 100;
  const clipId = `audio-clip-${element.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // OBS STREAM MODE: Strictly invisible, ONLY audio plays!
  if (mode === "obs") {
    return (
      <audio
        ref={audioRef}
        src={element.src}
        preload="auto"
        loop={isLoop}
        muted={isMuted}
        style={{ display: "none" }}
      />
    );
  }

  // THUMBNAIL MODE: Silent compact visual preview
  if (mode === "thumbnail") {
    return (
      <div className="w-full h-full rounded-xl bg-black/90 border border-orange-400/30 flex items-center justify-center p-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${waveViewW} ${waveViewH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <path
            d={wavePath}
            fill="none"
            stroke={waveColor}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // EDITOR MODE (OBoardS): Full interactive waveform visualizer + scrubbable slider + duration below
  return (
    <div className="w-full h-full rounded-2xl bg-[#07090f]/95 border border-orange-400/35 shadow-[0_14px_40px_rgba(0,0,0,0.72)] flex flex-col justify-between overflow-hidden select-none">
      <audio
        ref={audioRef}
        src={element.src}
        preload="auto"
        loop={isLoop}
        muted={isMuted}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onEnded={() => {
          if (!isLoop) {
            setCurrentTime(0);
            emitLiveAudioTime(element.id, 0);
            if (audioRef.current) {
              try {
                audioRef.current.currentTime = 0;
              } catch {
                // ignore
              }
            }
            onAudioControl?.(element.id, {
              playing: false,
              currentTimeSec: 0,
              commit: true,
            });
          }
        }}
        style={{ display: "none" }}
      />

      {/* Top Header Bar (grab here to drag card on canvas) */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={togglePlay}
            disabled={!canEdit}
            title={isPlaying ? "Pausar audio" : "Reproducir audio"}
            aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-lg"
            style={{
              backgroundColor: waveColor,
              color: "#090b10",
              boxShadow: isPlaying ? `0 0 18px ${waveColor}90` : undefined,
            }}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">
              {element.name}
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-300/90">
              <Radio className="w-2.5 h-2.5" />
              <span>Solo audio en stream (oculto visualmente en OBS)</span>
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!canEdit}
            onClick={handleRestart}
            title="Reiniciar desde 0:00"
            aria-label="Reiniciar audio"
            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={handleToggleLoop}
            title={isLoop ? "Desactivar bucle" : "Activar bucle"}
            aria-label="Alternar bucle"
            className={`p-1.5 rounded-lg transition-colors ${
              isLoop
                ? "bg-orange-500/25 text-orange-300 border border-orange-400/40"
                : "bg-white/[0.05] hover:bg-white/[0.12] text-zinc-400 hover:text-white"
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={handleToggleMute}
            title={element.muted ? "Activar sonido" : "Silenciar"}
            aria-label={element.muted ? "Activar sonido" : "Silenciar"}
            className={`p-1.5 rounded-lg transition-colors ${
              element.muted
                ? "bg-rose-500/20 text-rose-300"
                : "bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white"
            }`}
          >
            {element.muted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Oscilloscope Waveform Visualizer (click or drag anywhere to scrub!) */}
      <div
        ref={scrubRef}
        onPointerDown={(e) => handleScrubPointerDown(e, scrubRef)}
        onPointerMove={(e) => handleScrubPointerMove(e, scrubRef)}
        onPointerUp={(e) => handleScrubPointerUp(e, scrubRef)}
        onPointerCancel={(e) => handleScrubPointerUp(e, scrubRef)}
        title="Haz clic o arrastra sobre la onda para avanzar o retroceder"
        className="relative flex-1 min-h-[64px] mx-3 my-1.5 rounded-xl bg-black border border-white/[0.06] overflow-hidden cursor-ew-resize"
      >
        <svg
          viewBox={`0 0 ${waveViewW} ${waveViewH}`}
          preserveAspectRatio="none"
          className="w-full h-full block"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={0}
                y={0}
                width={(progress * waveViewW).toFixed(2)}
                height={waveViewH}
              />
            </clipPath>
          </defs>

          {/* Subtle center baseline */}
          <line
            x1={0}
            y1={waveViewH / 2}
            x2={waveViewW}
            y2={waveViewH / 2}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />

          {/* Unplayed waveform (dimmed) */}
          <path
            d={wavePath}
            fill="none"
            stroke={waveColor}
            strokeOpacity={0.28}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Played waveform (bright glowing accent, advances & rewinds live!) */}
          <g clipPath={`url(#${clipId})`}>
            <path
              d={wavePath}
              fill="none"
              stroke={waveColor}
              strokeOpacity={0.45}
              strokeWidth={7.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "blur(3px)" }}
            />
            <path
              d={wavePath}
              fill="none"
              stroke={waveColor}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>

        {/* Crisp Playhead Needle */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5"
          style={{
            left: `${progressPct}%`,
            backgroundColor: "#ffffff",
            boxShadow: `0 0 10px ${waveColor}, 0 0 4px #ffffff`,
          }}
        />
      </div>

      {/* Dedicated Audio Scrubber Slider + Duration Below */}
      <div
        className="px-3.5 pt-1 pb-2.5 space-y-1 bg-black/50"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          ref={sliderRef}
          role="slider"
          aria-label="Posición de audio"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalDuration)}
          aria-valuenow={Math.round(currentTime)}
          onPointerDown={(e) => handleScrubPointerDown(e, sliderRef)}
          onPointerMove={(e) => handleScrubPointerMove(e, sliderRef)}
          onPointerUp={(e) => handleScrubPointerUp(e, sliderRef)}
          onPointerCancel={(e) => handleScrubPointerUp(e, sliderRef)}
          className="relative h-5 flex items-center cursor-pointer"
        >
          <div className="w-full h-1.5 rounded-full bg-white/[0.12] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                backgroundColor: waveColor,
                boxShadow: `0 0 10px ${waveColor}`,
              }}
            />
          </div>
          <div
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 transition-transform ${
              isScrubbing ? "w-4 h-4 scale-110" : "w-3.5 h-3.5 hover:scale-110"
            }`}
            style={{
              left: `${progressPct}%`,
              borderColor: waveColor,
              boxShadow: `0 0 12px ${waveColor}`,
            }}
          />
        </div>

        {/* Duration Row Below the Audio */}
        <div className="flex items-center justify-between text-[12px] font-mono tabular-nums text-zinc-300">
          <span className="font-semibold" style={{ color: waveColor }}>
            {formatAudioTime(currentTime)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans">
            {isPlaying ? "Reproduciendo" : "Pausado"}
          </span>
          <span className="text-zinc-400">
            {formatAudioTime(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
