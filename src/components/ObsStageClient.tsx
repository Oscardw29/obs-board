"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { connectBoardRealtime } from "@/lib/client-realtime";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardBackgroundConfig,
  type BoardElement,
  type RealtimeEvent,
} from "@/types/board";
import { StageElement } from "./StageElement";

interface ObsStageClientProps {
  boardId: string;
  obsToken: string;
  stageWidth?: number;
  stageHeight?: number;
  initialElements: BoardElement[];
  initialBackground?: BoardBackgroundConfig;
}

export const ObsStageClient: React.FC<ObsStageClientProps> = ({
  boardId,
  obsToken,
  stageWidth = STAGE_WIDTH,
  stageHeight = STAGE_HEIGHT,
  initialElements,
  initialBackground,
}) => {
  const clientId = useMemo(() => `obs_${nanoid(10)}`, []);
  const [elements, setElements] = useState<BoardElement[]>(initialElements);
  const [background, setBackground] = useState<BoardBackgroundConfig | undefined>(
    initialBackground
  );
  const [liveDrafts, setLiveDrafts] = useState<
    Record<string, { element: BoardElement; receivedAt: number }>
  >({});
  const [scale, setScale] = useState(1);

  const hadDisconnectRef = useRef(false);
  const lastHashRef = useRef<string>("");
  const finalizedDraftsRef = useRef<Map<string, number>>(new Map());
  const strokeSeqRef = useRef<Map<string, number>>(new Map());

  // Enforce strict transparent background on html & body for OBS Browser Source
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.documentElement.style.overflow = "hidden";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
  }, []);

  // Scale 1920x1080 stage cleanly to match OBS Browser Source size
  useEffect(() => {
    const updateScale = () => {
      const sx = window.innerWidth / stageWidth;
      const sy = window.innerHeight / stageHeight;
      setScale(Math.min(sx, sy));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [stageWidth, stageHeight]);

  const resyncSnapshot = useCallback(
    async (force = false) => {
      try {
        const hashParam =
          !force && lastHashRef.current
            ? `&hash=${encodeURIComponent(lastHashRef.current)}`
            : "";
        const res = await fetch(
          `/api/boards/${encodeURIComponent(boardId)}/obs?token=${encodeURIComponent(obsToken)}${hashParam}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          unchanged?: boolean;
          hash?: string;
          board?: {
            elements: BoardElement[];
            background?: BoardBackgroundConfig;
          };
        };
        if (data.hash) lastHashRef.current = data.hash;
        if (data.unchanged) return;
        if (data.board?.elements) {
          setElements(data.board.elements);
          setBackground(data.board.background);
          setLiveDrafts({});
        }
      } catch {
        // Ignore transient network errors
      }
    },
    [boardId, obsToken]
  );

  // Real-time sync + snapshot reconciliation
  useEffect(() => {
    const markFinalized = (id: string) => {
      finalizedDraftsRef.current.set(id, Date.now());
    };

    const isRecentlyFinalized = (id: string) => {
      const ts = finalizedDraftsRef.current.get(id);
      if (!ts) return false;
      if (Date.now() - ts > 30000) {
        finalizedDraftsRef.current.delete(id);
        return false;
      }
      return true;
    };

    const conn = connectBoardRealtime({
      boardId,
      clientId,
      obsToken,
      onStatusChange: (status) => {
        if (status === "disconnected") {
          hadDisconnectRef.current = true;
        } else if (status === "connected" && hadDisconnectRef.current) {
          hadDisconnectRef.current = false;
          void resyncSnapshot(true);
        }
      },
      onEvent: (event: RealtimeEvent) => {
        switch (event.type) {
          case "elements:replace":
            setElements(event.elements);
            setLiveDrafts({});
            break;
          case "element:upsert":
            markFinalized(event.element.id);
            setElements((prev) => {
              const exists = prev.some((e) => e.id === event.element.id);
              if (exists) {
                return prev.map((e) =>
                  e.id === event.element.id ? event.element : e
                );
              }
              return [...prev, event.element];
            });
            setLiveDrafts((prev) => {
              if (!prev[event.element.id]) return prev;
              const copy = { ...prev };
              delete copy[event.element.id];
              return copy;
            });
            break;
          case "elements:upsertMany":
            for (const el of event.elements) markFinalized(el.id);
            setElements((prev) => {
              const map = new Map(prev.map((e) => [e.id, e]));
              for (const el of event.elements) map.set(el.id, el);
              return Array.from(map.values());
            });
            setLiveDrafts((prev) => {
              const copy = { ...prev };
              let changed = false;
              for (const el of event.elements) {
                if (copy[el.id]) {
                  delete copy[el.id];
                  changed = true;
                }
              }
              return changed ? copy : prev;
            });
            break;
          case "element:patch":
            setElements((prev) =>
              prev.map((e) =>
                e.id === event.elementId ? { ...e, ...event.patch } : e
              )
            );
            break;
          case "elements:batchPatch": {
            const pMap = new Map(
              event.patches.map((p) => [p.elementId, p.patch])
            );
            setElements((prev) =>
              prev.map((e) => {
                const p = pMap.get(e.id);
                return p ? { ...e, ...p } : e;
              })
            );
            break;
          }
          case "element:delete": {
            const set = new Set(event.elementIds);
            for (const id of event.elementIds) markFinalized(id);
            setElements((prev) => prev.filter((e) => !set.has(e.id)));
            setLiveDrafts((prev) => {
              const copy = { ...prev };
              let changed = false;
              for (const id of event.elementIds) {
                if (copy[id]) {
                  delete copy[id];
                  changed = true;
                }
              }
              return changed ? copy : prev;
            });
            break;
          }
          case "member:kicked": {
            if (event.deletedElementIds?.length) {
              const set = new Set(event.deletedElementIds);
              setElements((prev) => prev.filter((e) => !set.has(e.id)));
            }
            break;
          }
          case "stroke:live": {
            if (isRecentlyFinalized(event.element.id)) return;
            if (typeof event.seq === "number") {
              const prevSeq = strokeSeqRef.current.get(event.element.id) ?? -1;
              if (event.seq <= prevSeq) return;
              strokeSeqRef.current.set(event.element.id, event.seq);
            }
            setLiveDrafts((prev) => ({
              ...prev,
              [event.element.id]: {
                element: event.element,
                receivedAt: Date.now(),
              },
            }));
            break;
          }
          case "stroke:end":
            markFinalized(event.elementId);
            setLiveDrafts((prev) => {
              if (!prev[event.elementId]) return prev;
              const copy = { ...prev };
              delete copy[event.elementId];
              return copy;
            });
            break;
          case "video:trigger":
            setElements((prev) =>
              prev.map((e) =>
                e.id === event.elementId
                  ? {
                      ...e,
                      triggerId: event.triggerId,
                      triggeredAt: event.triggeredAt,
                      playing: event.playing,
                      visible:
                        event.visible !== undefined ? event.visible : e.visible,
                      loop: event.loop !== undefined ? event.loop : e.loop,
                      muted: event.muted !== undefined ? event.muted : e.muted,
                      volume:
                        event.volume !== undefined ? event.volume : e.volume,
                      autoHideOnEnd:
                        event.autoHideOnEnd !== undefined
                          ? event.autoHideOnEnd
                          : e.autoHideOnEnd,
                    }
                  : e
              )
            );
            break;
          case "audio:control":
            setElements((prev) =>
              prev.map((e) =>
                e.id === event.elementId
                  ? {
                      ...e,
                      playing: event.playing,
                      currentTimeSec: event.currentTimeSec,
                      triggeredAt: event.triggeredAt,
                      seekId: event.seekId,
                      loop: event.loop !== undefined ? event.loop : e.loop,
                      muted: event.muted !== undefined ? event.muted : e.muted,
                      volume:
                        event.volume !== undefined ? event.volume : e.volume,
                    }
                  : e
              )
            );
            break;
          case "board:meta":
            if (event.background !== undefined) {
              setBackground(event.background);
            }
            break;
          default:
            break;
        }
      },
    });

    // Sweep stale liveDrafts (> 5s old) every 2s so unfinished strokes never stick
    const draftSweepTimer = setInterval(() => {
      const cutoff = Date.now() - 5000;
      setLiveDrafts((prev) => {
        let changed = false;
        const next: Record<string, { element: BoardElement; receivedAt: number }> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.receivedAt >= cutoff) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    // Periodic lightweight hash reconciliation (every 12s)
    const reconcileTimer = setInterval(() => {
      void resyncSnapshot(false);
    }, 12000);

    const onVisChange = () => {
      if (document.visibilityState === "visible") {
        void resyncSnapshot(false);
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      clearInterval(draftSweepTimer);
      clearInterval(reconcileTimer);
      document.removeEventListener("visibilitychange", onVisChange);
      conn.close();
    };
  }, [boardId, clientId, obsToken, resyncSnapshot]);

  return (
    <div
      className="obs-stage-root fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: "transparent" }}
    >
      <div
        style={{
          position: "relative",
          width: stageWidth,
          height: stageHeight,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          overflow: "hidden",
          backgroundColor: "transparent",
        }}
      >
        {background?.imageUrl && background.showInObs && (
          <img
            src={background.imageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: background.fit ?? "cover",
              opacity: background.opacity ?? 1,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        )}
        {elements.map((el) => (
          <StageElement key={el.id} element={el} mode="obs" />
        ))}
        {Object.values(liveDrafts).map((draft) => (
          <StageElement key={draft.element.id} element={draft.element} mode="obs" />
        ))}
      </div>
    </div>
  );
};
