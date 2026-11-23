"use client";

import React, { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const LOOP_DURATION_MS = 10000;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function easeOut(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function segProgress(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleWaypoints(
  t: number,
  waypoints: Array<{ t: number; x: number; y: number }>
): { x: number; y: number } {
  if (t <= waypoints[0].t) return { x: waypoints[0].x, y: waypoints[0].y };
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (t >= a.t && t <= b.t) {
      const local = easeInOut((t - a.t) / Math.max(0.0001, b.t - a.t));
      return {
        x: lerp(a.x, b.x, local),
        y: lerp(a.y, b.y, local),
      };
    }
  }
  const last = waypoints[waypoints.length - 1];
  return { x: last.x, y: last.y };
}

function CursorBadge({
  name,
  color,
  x,
  y,
  clicking = false,
  toolBadge,
}: {
  name: string;
  color: string;
  x: number;
  y: number;
  clicking?: boolean;
  toolBadge?: string;
}) {
  return (
    <g
      transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${
        clicking ? 0.9 : 1
      })`}
    >
      {clicking && (
        <circle
          cx="2"
          cy="2"
          r="14"
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity="0.55"
        />
      )}
      <path
        d="M0 0 L6 18 L9.5 11.5 L16.5 8.5 Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g transform="translate(13, 14)">
        <rect
          x="0"
          y="0"
          width={name.length * 7 + (toolBadge ? 28 : 14)}
          height="20"
          rx="10"
          fill={color}
        />
        <text
          x="8"
          y="13.5"
          fill="#090b10"
          fontSize="10.5"
          fontWeight="700"
          fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        >
          {name}
          {toolBadge ? ` · ${toolBadge}` : ""}
        </text>
      </g>
    </g>
  );
}

export const LoginSceneBackground: React.FC = () => {
  const [phase, setPhase] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setPaused(true);
      setPhase(0.36);
      return;
    }

    if (paused) return;

    let rafId = 0;
    const start = performance.now() - phase * LOOP_DURATION_MS;

    const tick = (now: number) => {
      const elapsed = (now - start) % LOOP_DURATION_MS;
      setPhase(elapsed / LOOP_DURATION_MS);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const t = phase;

  // 1. Collaborator cursor trajectories (t=0 and t=1 match identically!)
  const maya = sampleWaypoints(t, [
    { t: 0.0, x: 110, y: 185 },
    { t: 0.08, x: 235, y: 118 },
    { t: 0.16, x: 380, y: 185 },
    { t: 0.24, x: 300, y: 315 },
    { t: 0.34, x: 560, y: 270 },
    { t: 0.56, x: 280, y: 245 },
    { t: 0.74, x: 220, y: 215 },
    { t: 0.9, x: 110, y: 185 },
    { t: 1.0, x: 110, y: 185 },
  ]);

  const leo = sampleWaypoints(t, [
    { t: 0.0, x: 1140, y: 170 },
    { t: 0.14, x: 1030, y: 185 },
    { t: 0.25, x: 565, y: 272 },
    { t: 0.36, x: 960, y: 305 },
    { t: 0.48, x: 1018, y: 356 },
    { t: 0.64, x: 1055, y: 190 },
    { t: 0.85, x: 1110, y: 175 },
    { t: 1.0, x: 1140, y: 170 },
  ]);

  const sofi = sampleWaypoints(t, [
    { t: 0.0, x: 130, y: 630 },
    { t: 0.14, x: 235, y: 585 },
    { t: 0.36, x: 115, y: 495 },
    { t: 0.48, x: 435, y: 660 },
    { t: 0.58, x: 355, y: 590 },
    { t: 0.72, x: 270, y: 545 },
    { t: 0.9, x: 130, y: 630 },
    { t: 1.0, x: 130, y: 630 },
  ]);

  const kairo = sampleWaypoints(t, [
    { t: 0.0, x: 1120, y: 650 },
    { t: 0.18, x: 1020, y: 565 },
    { t: 0.32, x: 930, y: 500 },
    { t: 0.46, x: 995, y: 390 },
    { t: 0.68, x: 940, y: 525 },
    { t: 0.78, x: 520, y: 295 },
    { t: 0.87, x: 260, y: 170 },
    { t: 0.96, x: 1120, y: 650 },
    { t: 1.0, x: 1120, y: 650 },
  ]);

  // 2. Cyan freehand ribbon drawn by Maya (0.02..0.16), erased by Kairo (0.78..0.88)
  const strokeDraw = easeOut(segProgress(t, 0.02, 0.16));
  const strokeFade = 1 - easeInOut(segProgress(t, 0.82, 0.9));
  const strokeDashOffset = 460 * (1 - strokeDraw);

  // 3. "EN VIVO • 1080p" card (top right)
  const liveCardIn = easeOut(segProgress(t, 0.05, 0.15));
  const liveCardOut = 1 - easeInOut(segProgress(t, 0.84, 0.92));
  const liveCardOpacity = liveCardIn * liveCardOut;
  const liveCardScale = 0.85 + 0.15 * liveCardIn;
  const liveCardPulse =
    t >= 0.46 && t <= 0.68
      ? 1 + 0.04 * Math.sin(segProgress(t, 0.46, 0.68) * Math.PI * 2)
      : 1;

  // 4. Handed-off Diamond Badge (Maya passes to Leo, Leo snaps & transforms it)
  const badgeAppear = easeOut(segProgress(t, 0.16, 0.22));
  const badgeFade = 1 - easeInOut(segProgress(t, 0.78, 0.86));
  const badgeOpacity = badgeAppear * badgeFade;

  let badgeX = 290;
  let badgeY = 305;
  if (t >= 0.22 && t <= 0.34) {
    badgeX = lerp(290, 545, easeInOut(segProgress(t, 0.22, 0.34)));
    badgeY = lerp(305, 265, easeInOut(segProgress(t, 0.22, 0.34)));
  } else if (t > 0.34 && t <= 0.42) {
    badgeX = lerp(545, 955, easeInOut(segProgress(t, 0.34, 0.42)));
    badgeY = lerp(265, 300, easeInOut(segProgress(t, 0.34, 0.42)));
  } else if (t > 0.42) {
    badgeX = 955;
    badgeY = 300;
  }

  const badgeTransformProg = easeInOut(segProgress(t, 0.38, 0.5));
  const badgeScale = 1 + 0.28 * badgeTransformProg;
  const badgeRot = 18 * badgeTransformProg;
  const badgeSelected = t >= 0.36 && t <= 0.54;

  // Magnetic alignment flash when Leo snaps badge to liveCard center
  const snapLineOpacity =
    t >= 0.35 && t <= 0.45
      ? Math.sin(segProgress(t, 0.35, 0.45) * Math.PI)
      : 0;

  // 5. Sofi's Live Typing Text + Audio ON Pill + Marquee Multi-Select
  const textAppear = easeOut(segProgress(t, 0.08, 0.14));
  const textFade = 1 - easeInOut(segProgress(t, 0.84, 0.92));
  const textOpacity = textAppear * textFade;

  const fullTyped = "OBoardS Live!";
  const charCount = Math.floor(
    segProgress(t, 0.11, 0.28) * fullTyped.length
  );
  const typedString =
    t < 0.11 ? "" : t >= 0.28 ? fullTyped : fullTyped.slice(0, charCount);

  const marqueeActive = t >= 0.36 && t <= 0.49;
  const marqueeProg = easeOut(segProgress(t, 0.36, 0.48));
  const groupShiftProg = easeInOut(segProgress(t, 0.49, 0.58));
  const groupReturnProg = easeInOut(segProgress(t, 0.85, 0.95));
  const groupDx = 54 * groupShiftProg * (1 - groupReturnProg);
  const groupDy = -26 * groupShiftProg * (1 - groupReturnProg);

  // 6. Kairo's "Clips" pill + Arrow pointing to Live Card
  const clipsAppear = easeOut(segProgress(t, 0.18, 0.25));
  const clipsFade = 1 - easeInOut(segProgress(t, 0.82, 0.9));
  const clipsOpacity = clipsAppear * clipsFade;
  const clipsBounce =
    t >= 0.3 && t <= 0.38
      ? Math.sin(segProgress(t, 0.3, 0.38) * Math.PI) * -12
      : 0;

  const arrowDraw = easeOut(segProgress(t, 0.35, 0.46));
  const arrowFade = 1 - easeInOut(segProgress(t, 0.78, 0.85));

  // 7. Interactive Emojis colliding/bouncing
  const emojiBurst = (start: number, end: number) => {
    const p = segProgress(t, start, end);
    if (p <= 0 || p >= 1) return { o: 0, s: 0.5, dy: 0 };
    const o = p < 0.2 ? p / 0.2 : p > 0.75 ? (1 - p) / 0.25 : 1;
    const s = 0.7 + 0.45 * Math.sin(Math.min(1, p * 2.5) * (Math.PI / 2));
    const dy = -26 * easeOut(p);
    return { o, s, dy };
  };

  const eZap = emojiBurst(0.55, 0.76);
  const ePalette = emojiBurst(0.58, 0.78);
  const eSpark = emojiBurst(0.62, 0.81);
  const eFire = emojiBurst(0.65, 0.84);

  const eraserActive = t >= 0.76 && t <= 0.89;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden bg-studio-950 select-none pointer-events-none"
    >
      {/* Subtle architectural studio grid */}
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Focused Broadcast Blue ambient glow */}
      <div className="absolute -top-36 left-1/2 -translate-x-1/2 w-[820px] h-[380px] rounded-full bg-sky-500/10 blur-[130px]" />
      <div className="absolute -bottom-44 left-1/4 w-[520px] h-[320px] rounded-full bg-blue-600/10 blur-[120px]" />

      <svg
        viewBox="0 0 1280 800"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <defs>
          <filter id="loginCyanGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* OBS 16:9 guide frame corners */}
        <g stroke="rgba(56,189,248,0.16)" strokeWidth="1.5" fill="none">
          <rect x="44" y="44" width="1192" height="712" rx="18" strokeDasharray="8 8" />
          <path d="M44 78 V44 H78 M1202 44 H1236 V78 M44 722 V756 H78 M1202 756 H1236 V722" stroke="rgba(56,189,248,0.38)" strokeWidth="2.5" />
        </g>

        {/* Maya's Freehand Stroke */}
        <path
          d="M 110 185 C 165 80, 235 85, 275 160 C 315 230, 355 120, 415 155"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="460"
          strokeDashoffset={strokeDashOffset}
          opacity={strokeFade}
          filter="url(#loginCyanGlow)"
        />

        {/* Leo's EN VIVO Card */}
        <g
          transform={`translate(955, 165) scale(${(liveCardScale * liveCardPulse).toFixed(3)})`}
          opacity={liveCardOpacity}
        >
          <rect
            x="-95"
            y="-34"
            width="210"
            height="68"
            rx="16"
            fill="#10131c"
            stroke="#38bdf8"
            strokeWidth="2.2"
          />
          <circle cx="-68" cy="0" r="6" fill="#10b981" />
          <text
            x="-52"
            y="5"
            fill="#f8fafc"
            fontSize="16"
            fontWeight="700"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
          >
            EN VIVO · 1080p
          </text>
        </g>

        {/* Magnetic Snap Alignment Guides */}
        {snapLineOpacity > 0.02 && (
          <g opacity={snapLineOpacity} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 4">
            <line x1="955" y1="90" x2="955" y2="390" />
            <line x1="820" y1="300" x2="1120" y2="300" />
          </g>
        )}

        {/* Handed-off Diamond Shape transformed by Leo */}
        {badgeOpacity > 0.01 && (
          <g
            transform={`translate(${badgeX.toFixed(1)}, ${badgeY.toFixed(1)}) rotate(${badgeRot.toFixed(1)}) scale(${badgeScale.toFixed(3)})`}
            opacity={badgeOpacity}
          >
            <rect
              x="-38"
              y="-38"
              width="76"
              height="76"
              rx="18"
              fill="rgba(56, 189, 248, 0.16)"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />
            <polygon
              points="0,-20 19,0 0,20 -19,0"
              fill="#38bdf8"
              opacity="0.9"
            />
            {badgeSelected && (
              <g>
                <rect
                  x="-46"
                  y="-46"
                  width="92"
                  height="92"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <circle cx="0" cy="-64" r="5" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
                {[
                  [-46, -46],
                  [46, -46],
                  [-46, 46],
                  [46, 46],
                ].map(([hx, hy], idx) => (
                  <rect
                    key={idx}
                    x={hx - 4}
                    y={hy - 4}
                    width="8"
                    height="8"
                    rx="2"
                    fill="#fff"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            )}
          </g>
        )}

        {/* Kairo's Clips Pill + Arrow */}
        {clipsOpacity > 0.01 && (
          <g
            transform={`translate(930, ${(500 + clipsBounce).toFixed(1)})`}
            opacity={clipsOpacity}
          >
            <rect
              x="-68"
              y="-24"
              width="136"
              height="48"
              rx="14"
              fill="#161a26"
              stroke="#f43f5e"
              strokeWidth="2"
            />
            <text
              x="0"
              y="6"
              textAnchor="middle"
              fill="#fecdd3"
              fontSize="15"
              fontWeight="700"
              fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
            >
              Clips MP4
            </text>
          </g>
        )}

        {arrowDraw > 0.02 && arrowFade > 0.02 && (
          <g opacity={arrowFade}>
            <line
              x1="935"
              y1="468"
              x2={lerp(935, 955, arrowDraw)}
              y2={lerp(468, 365, arrowDraw)}
              stroke="#f43f5e"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {arrowDraw > 0.85 && (
              <polyline
                points="947,376 955,363 964,376"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        )}

        {/* Sofi's Group: Live Text + Audio ON Pill */}
        {textOpacity > 0.01 && (
          <g
            transform={`translate(${groupDx.toFixed(1)}, ${groupDy.toFixed(1)})`}
            opacity={textOpacity}
          >
            <rect
              x="145"
              y="540"
              width="258"
              height="62"
              rx="14"
              fill="rgba(16, 19, 28, 0.86)"
              stroke={t >= 0.58 && t <= 0.72 ? "#f59e0b" : "#334155"}
              strokeWidth="2"
            />
            <text
              x="166"
              y="579"
              fill="#f8fafc"
              fontSize="24"
              fontWeight="700"
              fontFamily="'Space Grotesk', system-ui, sans-serif"
            >
              {typedString}
            </text>

            <rect
              x="150"
              y="618"
              width="124"
              height="34"
              rx="10"
              fill="#10131c"
              stroke="#10b981"
              strokeWidth="1.6"
            />
            <text
              x="212"
              y="640"
              textAnchor="middle"
              fill="#6ee7b7"
              fontSize="13"
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
            >
              Audio ON
            </text>
          </g>
        )}

        {/* Sofi's Marquee Selection Box (Tool V) */}
        {marqueeActive && (
          <rect
            x="115"
            y="495"
            width={Math.max(8, 320 * marqueeProg)}
            height={Math.max(8, 165 * marqueeProg)}
            rx="6"
            fill="rgba(56, 189, 248, 0.1)"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
        )}

        {/* Collaborative Emojis reacting */}
        {eZap.o > 0 && (
          <text
            x="280"
            y={230 + eZap.dy}
            fontSize={30 * eZap.s}
            textAnchor="middle"
            opacity={eZap.o}
          >
            ⚡
          </text>
        )}
        {ePalette.o > 0 && (
          <text
            x="355"
            y={575 + ePalette.dy}
            fontSize={30 * ePalette.s}
            textAnchor="middle"
            opacity={ePalette.o}
          >
            🎨
          </text>
        )}
        {eSpark.o > 0 && (
          <text
            x="1055"
            y={145 + eSpark.dy}
            fontSize={30 * eSpark.s}
            textAnchor="middle"
            opacity={eSpark.o}
          >
            ✨
          </text>
        )}
        {eFire.o > 0 && (
          <text
            x="930"
            y={480 + eFire.dy}
            fontSize={32 * eFire.s}
            textAnchor="middle"
            opacity={eFire.o}
          >
            🔥
          </text>
        )}

        {/* Kairo's Eraser ring */}
        {eraserActive && (
          <circle
            cx={kairo.x}
            cy={kairo.y}
            r="22"
            fill="rgba(244, 63, 94, 0.14)"
            stroke="#f43f5e"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}

        {/* Live Collaborator Cursors */}
        <CursorBadge
          name="Maya"
          color="#38bdf8"
          x={maya.x}
          y={maya.y}
          clicking={t > 0.02 && t < 0.16}
          toolBadge={t < 0.16 ? "Pincel" : undefined}
        />
        <CursorBadge
          name="Leo"
          color="#10b981"
          x={leo.x}
          y={leo.y}
          clicking={t >= 0.36 && t <= 0.5}
          toolBadge={t >= 0.36 && t <= 0.5 ? "Escalar" : undefined}
        />
        <CursorBadge
          name="Sofi"
          color="#f59e0b"
          x={sofi.x}
          y={sofi.y}
          clicking={marqueeActive}
          toolBadge={marqueeActive ? "V" : undefined}
        />
        <CursorBadge
          name="Kairo"
          color="#f43f5e"
          x={kairo.x}
          y={kairo.y}
          clicking={eraserActive}
          toolBadge={eraserActive ? "Borrador" : undefined}
        />
      </svg>

      {/* Subtle loop control */}
      <button
        type="button"
        onClick={() => setPaused((v) => !v)}
        aria-label={paused ? "Reanudar fondo interactivo" : "Pausar fondo interactivo"}
        className="pointer-events-auto fixed bottom-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-studio-900/85 hover:bg-studio-800 border border-white/[0.1] text-[11px] text-zinc-400 hover:text-zinc-200 backdrop-blur transition-colors"
      >
        {paused ? (
          <>
            <Play className="w-3 h-3 text-sky-400" />
            <span>Reanudar escena</span>
          </>
        ) : (
          <>
            <Pause className="w-3 h-3 text-sky-400" />
            <span>Escena colaborativa</span>
          </>
        )}
      </button>
    </div>
  );
};
