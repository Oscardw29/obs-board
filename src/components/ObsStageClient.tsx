"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { connectBoardRealtime } from "@/lib/client-realtime";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
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
}

export const ObsStageClient: React.FC<ObsStageClientProps> = ({
  boardId,
  obsToken,
  stageWidth = STAGE_WIDTH,
  stageHeight = STAGE_HEIGHT,
  initialElements,
}) => {
  const clientId = useMemo(() => `obs_${nanoid(10)}`, []);
  const [elements, setElements] = useState<BoardElement[]>(initialElements);
  const [liveDrafts, setLiveDrafts] = useState<Record<string, BoardElement>>(
    {}
  );
  const [scale, setScale] = useState(1);
  const hadDisconnectRef = useRef(false);

  // Enforce strict transparent background on html & body for OBS Browser Source
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.documentElement.style.overflow = "hidden";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
  }, []);

  // Scale 1920x1080 stage cleanly to match OBS Browser Source size (exact 1.0 at 1920x1080)
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

  // Real-time sync with automatic snapshot resync after reconnects
  useEffect(() => {
    const resyncSnapshot = async () => {
      try {
        const res = await fetch(
          `/api/boards/${encodeURIComponent(boardId)}/obs?token=${encodeURIComponent(obsToken)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          board?: { elements: BoardElement[] };
        };
        if (data.board?.elements) {
          setElements(data.board.elements);
          setLiveDrafts({});
        }
      } catch {
        // Ignore transient network errors
      }
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
          void resyncSnapshot();
        }
      },
      onEvent: (event: RealtimeEvent) => {
        switch (event.type) {
          case "elements:replace":
            setElements(event.elements);
            break;
          case "element:upsert":
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
          case "element:patch":
            setElements((prev) =>
              prev.map((e) =>
                e.id === event.elementId ? { ...e, ...event.patch } : e
              )
            );
            break;
          case "element:delete": {
            const set = new Set(event.elementIds);
            setElements((prev) => prev.filter((e) => !set.has(e.id)));
            break;
          }
          case "stroke:live":
            setLiveDrafts((prev) => ({
              ...prev,
              [event.element.id]: event.element,
            }));
            break;
          case "stroke:end":
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
          default:
            break;
        }
      },
    });

    return () => {
      conn.close();
    };
  }, [boardId, clientId, obsToken]);

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
        {elements.map((el) => (
          <StageElement key={el.id} element={el} mode="obs" />
        ))}
        {Object.values(liveDrafts).map((draft) => (
          <StageElement key={draft.id} element={draft} mode="obs" />
        ))}
      </div>
    </div>
  );
};
