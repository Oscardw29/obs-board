"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  PanelLeft,
  PanelRight,
  Radio,
  Share2,
  WifiOff,
} from "lucide-react";
import {
  connectBoardRealtime,
  type RealtimeConnection,
} from "@/lib/client-realtime";
import {
  getElementDefaultName,
  getNextZIndex,
  normalizeStrokePoints,
} from "@/lib/geometry";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardDetail,
  type BoardElement,
  type CollaboratorCursor,
  type MediaAsset,
  type RealtimeEvent,
  type StrokePoint,
  type ToolType,
  type User,
} from "@/types/board";
import { EditorToolbar, type EditorBackdrop } from "./EditorToolbar";
import {
  LayersInspectorPanel,
  type DrawDefaults,
} from "./LayersInspectorPanel";
import { uploadMediaFile } from "@/lib/client-media-upload";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import { ShareModal } from "./ShareModal";
import { StageElement } from "./StageElement";

interface BoardEditorProps {
  initialBoard: BoardDetail;
  initialAssets: MediaAsset[];
  user: User;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type InteractionState =
  | { kind: "none" }
  | { kind: "pan"; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
  | {
      kind: "move";
      elementId: string;
      startStageX: number;
      startStageY: number;
      origX: number;
      origY: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      elementId: string;
      handle: ResizeHandle;
      startStageX: number;
      startStageY: number;
      orig: {
        x: number;
        y: number;
        width: number;
        height: number;
        x1?: number;
        y1?: number;
        x2?: number;
        y2?: number;
      };
      keepAspect: boolean;
    }
  | {
      kind: "rotate";
      elementId: string;
      centerX: number;
      centerY: number;
      startAngle: number;
      origRotation: number;
    }
  | {
      kind: "draw-freehand";
      elementId: string;
      rawPoints: StrokePoint[];
    }
  | {
      kind: "draw-shape";
      elementId: string;
      shapeType: "rectangle" | "ellipse" | "line" | "arrow";
      startX: number;
      startY: number;
    };

export const BoardEditor: React.FC<BoardEditorProps> = ({
  initialBoard,
  initialAssets,
  user,
}) => {
  const clientId = useMemo(() => `ed_${nanoid(10)}`, []);
  const canEdit = initialBoard.myRole !== "viewer";

  const [title, setTitle] = useState(initialBoard.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [obsToken, setObsToken] = useState(initialBoard.obsToken);
  const [members, setMembers] = useState(initialBoard.members);

  const [elements, setElements] = useState<BoardElement[]>(initialBoard.elements);
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [tool, setTool] = useState<ToolType>("select");
  const [backdrop, setBackdrop] = useState<EditorBackdrop>("checker-dark");
  const [showMediaPanel, setShowMediaPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [copiedObs, setCopiedObs] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");

  const [drawDefaults, setDrawDefaults] = useState<DrawDefaults>({
    strokeColor: "#ffffff",
    fillColor: "transparent",
    strokeWidth: 6,
    strokeStyle: "solid",
    opacity: 1,
    fontFamily: "hand",
    fontSize: 42,
    textBgColor: "rgba(17, 24, 39, 0.72)",
    textShadow: true,
  });

  // Live draft element (when drawing a new stroke/shape)
  const [draftElement, setDraftElement] = useState<BoardElement | null>(null);
  // Remote live drafts from collaborators
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, BoardElement>>({});
  // Remote collaborator cursors (EDITOR ONLY)
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, CollaboratorCursor>
  >({});

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<BoardElement[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardElement[][]>([]);

  // Viewport transform
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 80, y: 70 });

  const interactionRef = useRef<InteractionState>({ kind: "none" });
  const realtimeRef = useRef<RealtimeConnection | null>(null);
  const elementsRef = useRef<BoardElement[]>(elements);
  elementsRef.current = elements;

  const lastCursorSentRef = useRef(0);
  const lastLiveBroadcastRef = useRef(0);
  const patchDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Fit 1920x1080 OBS guide frame cleanly inside viewport with toolbar clearance
  const fitStageToViewport = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) return;
    const padX = 56;
    const topReserve = 104; // clearance for floating toolbar + OBS guide badge
    const padBottom = 52;
    const availW = Math.max(100, rect.width - padX);
    const availH = Math.max(100, rect.height - topReserve - padBottom);
    const scaleX = availW / STAGE_WIDTH;
    const scaleY = availH / STAGE_HEIGHT;
    const nextZoom = Math.max(0.15, Math.min(1.15, Math.min(scaleX, scaleY)));
    const nextPanX = (rect.width - STAGE_WIDTH * nextZoom) / 2;
    const nextPanY = topReserve + (availH - STAGE_HEIGHT * nextZoom) / 2;
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, []);

  // Auto-collapse sidebars on narrow screens so the 16:9 stage always fits
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1100) {
      setShowMediaPanel(false);
      setShowRightPanel(false);
    }
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    fitStageToViewport();
    const ro = new ResizeObserver(() => {
      fitStageToViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitStageToViewport, showMediaPanel, showRightPanel]);

  const screenToStage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  // Push snapshot for Undo
  const pushUndoSnapshot = useCallback((snapshot?: BoardElement[]) => {
    const snap = snapshot ?? elementsRef.current;
    setUndoStack((prev) => [...prev.slice(-39), snap]);
    setRedoStack([]);
  }, []);

  // API persistence helpers
  const persistUpsert = useCallback(
    async (element: BoardElement) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:upsert",
        senderId: clientId,
        element,
      });
      await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          senderId: clientId,
          element,
        }),
      }).catch(() => {});
    },
    [clientId, initialBoard.id]
  );

  const persistPatch = useCallback(
    async (elementId: string, patch: Partial<BoardElement>) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:patch",
        senderId: clientId,
        elementId,
        patch,
      });
      await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patch",
          senderId: clientId,
          elementId,
          patch,
        }),
      }).catch(() => {});
    },
    [clientId, initialBoard.id]
  );

  const persistDelete = useCallback(
    async (elementIds: string[]) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:delete",
        senderId: clientId,
        elementIds,
      });
      await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          senderId: clientId,
          elementIds,
        }),
      }).catch(() => {});
    },
    [clientId, initialBoard.id]
  );

  const persistReplace = useCallback(
    async (nextElements: BoardElement[]) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "elements:replace",
        senderId: clientId,
        elements: nextElements,
      });
      await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace",
          senderId: clientId,
          elements: nextElements,
        }),
      }).catch(() => {});
    },
    [clientId, initialBoard.id]
  );

  // Realtime subscription
  useEffect(() => {
    const conn = connectBoardRealtime({
      boardId: initialBoard.id,
      clientId,
      onStatusChange: setConnectionStatus,
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
            setRemoteDrafts((prev) => {
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
            setSelectedId((curr) => (curr && set.has(curr) ? null : curr));
            break;
          }
          case "stroke:live":
            setRemoteDrafts((prev) => ({
              ...prev,
              [event.element.id]: event.element,
            }));
            break;
          case "stroke:end":
            setRemoteDrafts((prev) => {
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
          case "board:meta":
            setTitle(event.title);
            break;
          case "cursor:move":
            setRemoteCursors((prev) => ({
              ...prev,
              [event.cursor.clientId]: event.cursor,
            }));
            break;
          case "cursor:leave":
            setRemoteCursors((prev) => {
              const copy = { ...prev };
              delete copy[event.clientId];
              return copy;
            });
            break;
        }
      },
    });

    realtimeRef.current = conn;

    // Prune stale remote cursors every 4s
    const pruneInterval = setInterval(() => {
      const cutoff = Date.now() - 12000;
      setRemoteCursors((prev) => {
        let changed = false;
        const next: Record<string, CollaboratorCursor> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.updatedAt >= cutoff) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 4000);

    return () => {
      clearInterval(pruneInterval);
      conn.sendEphemeral({
        type: "cursor:leave",
        senderId: clientId,
        clientId,
      });
      conn.close();
      realtimeRef.current = null;
    };
  }, [initialBoard.id, clientId]);

  // Mutations
  const handlePatchElement = useCallback(
    (id: string, patch: Partial<BoardElement>, immediate = true) => {
      if (!canEdit) return;
      setElements((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e))
      );

      if (immediate) {
        void persistPatch(id, patch);
      } else {
        const existingTimer = patchDebounceRef.current.get(id);
        if (existingTimer) clearTimeout(existingTimer);
        patchDebounceRef.current.set(
          id,
          setTimeout(() => {
            void persistPatch(id, patch);
            patchDebounceRef.current.delete(id);
          }, 160)
        );
      }
    },
    [canEdit, persistPatch]
  );

  const handleDeleteElement = useCallback(
    (id: string) => {
      if (!canEdit) return;
      pushUndoSnapshot();
      setElements((prev) => prev.filter((e) => e.id !== id));
      if (selectedId === id) setSelectedId(null);
      if (editingTextId === id) setEditingTextId(null);
      void persistDelete([id]);
    },
    [canEdit, editingTextId, persistDelete, pushUndoSnapshot, selectedId]
  );

  const handleDuplicateElement = useCallback(
    (id: string) => {
      if (!canEdit) return;
      const orig = elementsRef.current.find((e) => e.id === id);
      if (!orig) return;
      pushUndoSnapshot();
      const copy: BoardElement = {
        ...orig,
        id: `el_${nanoid(12)}`,
        name: `${orig.name} (copia)`,
        x: orig.x + 36,
        y: orig.y + 36,
        zIndex: getNextZIndex(elementsRef.current),
        updatedAt: Date.now(),
      };
      setElements((prev) => [...prev, copy]);
      setSelectedId(copy.id);
      void persistUpsert(copy);
    },
    [canEdit, persistUpsert, pushUndoSnapshot]
  );

  const handleMoveLayer = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!canEdit) return;
      const sorted = [...elementsRef.current].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const targetIdx = direction === "up" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      pushUndoSnapshot();
      const swapped = [...sorted];
      const temp = swapped[idx];
      swapped[idx] = swapped[targetIdx];
      swapped[targetIdx] = temp;

      const reindexed = swapped.map((el, i) => ({
        ...el,
        zIndex: i + 1,
        updatedAt: Date.now(),
      }));
      setElements(reindexed);
      void persistReplace(reindexed);
    },
    [canEdit, persistReplace, pushUndoSnapshot]
  );

  const handleTriggerVideo = useCallback(
    (
      elementId: string,
      opts?: { playing?: boolean; visible?: boolean; restart?: boolean }
    ) => {
      if (!canEdit) return;
      const el = elementsRef.current.find((e) => e.id === elementId);
      if (!el || el.type !== "video") return;

      const nextPlaying =
        opts?.playing !== undefined ? opts.playing : true;
      const nextVisible =
        opts?.visible !== undefined ? opts.visible : el.visible;
      const nextTriggerId = opts?.restart
        ? `trg_${nanoid(8)}`
        : el.triggerId || `trg_${nanoid(8)}`;
      const now = Date.now();

      setElements((prev) =>
        prev.map((item) =>
          item.id === elementId
            ? {
                ...item,
                playing: nextPlaying,
                visible: nextVisible,
                triggerId: nextTriggerId,
                triggeredAt: now,
                updatedAt: now,
              }
            : item
        )
      );

      const evt: RealtimeEvent = {
        type: "video:trigger",
        senderId: clientId,
        elementId,
        triggerId: nextTriggerId,
        triggeredAt: now,
        playing: nextPlaying,
        visible: nextVisible,
        loop: el.loop,
        muted: el.muted,
        volume: el.volume,
        autoHideOnEnd: el.autoHideOnEnd,
      };
      realtimeRef.current?.sendPersistedBroadcast(evt);

      void fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "triggerVideo",
          senderId: clientId,
          elementId,
          triggerId: nextTriggerId,
          triggeredAt: now,
          playing: nextPlaying,
          visible: nextVisible,
          loop: el.loop,
          muted: el.muted,
          volume: el.volume,
          autoHideOnEnd: el.autoHideOnEnd,
        }),
      }).catch(() => {});
    },
    [canEdit, clientId, initialBoard.id]
  );

  const handleInsertAsset = useCallback(
    (
      asset: MediaAsset,
      options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean },
      dropPos?: { x: number; y: number }
    ) => {
      if (!canEdit) return;
      pushUndoSnapshot();

      const maxW = 640;
      const maxH = 420;
      const natW = asset.width || 640;
      const natH = asset.height || 360;
      const ratio = natW / natH;
      let width = Math.min(maxW, natW);
      let height = width / ratio;
      if (height > maxH) {
        height = maxH;
        width = height * ratio;
      }

      const x = dropPos
        ? Math.round(dropPos.x - width / 2)
        : Math.round((STAGE_WIDTH - width) / 2);
      const y = dropPos
        ? Math.round(dropPos.y - height / 2)
        : Math.round((STAGE_HEIGHT - height) / 2);

      const now = Date.now();
      const newEl: BoardElement = {
        id: `el_${nanoid(12)}`,
        boardId: initialBoard.id,
        type: asset.kind === "video" ? "video" : "image",
        name: asset.name,
        x,
        y,
        width: Math.round(width),
        height: Math.round(height),
        rotation: 0,
        zIndex: getNextZIndex(elementsRef.current),
        visible: true,
        locked: false,
        opacity: 1,
        src: asset.url,
        mediaAssetId: asset.id,
        aspectRatio: ratio,
        objectFit: "contain",
        ...(asset.kind === "video"
          ? {
              playing: true,
              loop: options.loop,
              autoHideOnEnd: options.autoHideOnEnd,
              muted: options.muted,
              volume: 0.85,
              triggerId: `trg_${nanoid(8)}`,
              triggeredAt: now,
            }
          : {}),
        updatedAt: now,
      };

      setElements((prev) => [...prev, newEl]);
      setSelectedId(newEl.id);
      setTool("select");
      void persistUpsert(newEl);
    },
    [canEdit, initialBoard.id, persistUpsert, pushUndoSnapshot]
  );

  const handleHideAllVideos = useCallback(() => {
    if (!canEdit) return;
    pushUndoSnapshot();
    const next = elementsRef.current.map((e) =>
      e.type === "video"
        ? { ...e, visible: false, playing: false, updatedAt: Date.now() }
        : e
    );
    setElements(next);
    void persistReplace(next);
  }, [canEdit, persistReplace, pushUndoSnapshot]);

  const handleShowAllLayers = useCallback(() => {
    if (!canEdit) return;
    pushUndoSnapshot();
    const next = elementsRef.current.map((e) => ({
      ...e,
      visible: true,
      updatedAt: Date.now(),
    }));
    setElements(next);
    void persistReplace(next);
  }, [canEdit, persistReplace, pushUndoSnapshot]);

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (!canEdit || undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r.slice(-39), elementsRef.current]);
    setElements(prevSnapshot);
    void persistReplace(prevSnapshot);
  }, [canEdit, persistReplace, undoStack]);

  const handleRedo = useCallback(() => {
    if (!canEdit || redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u.slice(-39), elementsRef.current]);
    setElements(nextSnapshot);
    void persistReplace(nextSnapshot);
  }, [canEdit, persistReplace, redoStack]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.code === "Space" && !isInput) {
        setSpacePressed(true);
        return;
      }

      if (isInput) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        handleDuplicateElement(selectedId);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        fitStageToViewport();
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        canEdit
      ) {
        e.preventDefault();
        handleDeleteElement(selectedId);
        return;
      }

      if (e.key === "Escape") {
        setSelectedId(null);
        setEditingTextId(null);
        setTool("select");
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === "h" && selectedId && canEdit) {
        const el = elementsRef.current.find((item) => item.id === selectedId);
        if (el) handlePatchElement(el.id, { visible: !el.visible });
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "v") setTool("select");
      else if (key === "h") setTool("hand");
      else if (key === "p" && canEdit) setTool("freehand");
      else if (key === "r" && canEdit) setTool("rectangle");
      else if (key === "o" && canEdit) setTool("ellipse");
      else if (key === "l" && canEdit) setTool("line");
      else if (key === "a" && canEdit) setTool("arrow");
      else if (key === "t" && canEdit) setTool("text");
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    canEdit,
    fitStageToViewport,
    handleDeleteElement,
    handleDuplicateElement,
    handlePatchElement,
    handleRedo,
    handleUndo,
    selectedId,
  ]);

  // Title save
  const handleTitleSave = async () => {
    setEditingTitle(false);
    const clean = title.trim() || "Tablero OBS";
    setTitle(clean);
    await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean, senderId: clientId }),
    }).catch(() => {});
  };

  // Copy OBS URL
  const copyObsUrl = async () => {
    const url = `${window.location.origin}/obs/${initialBoard.id}?token=${encodeURIComponent(obsToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedObs(true);
      setTimeout(() => setCopiedObs(false), 2000);
    } catch {
      // ignore
    }
  };

  // Canvas pointer handlers
  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || tool === "hand" || spacePressed) {
      e.preventDefault();
      interactionRef.current = {
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    const pt = screenToStage(e.clientX, e.clientY);

    if (tool === "select") {
      setSelectedId(null);
      setEditingTextId(null);
      return;
    }

    if (!canEdit) return;

    if (tool === "text") {
      pushUndoSnapshot();
      const newText: BoardElement = {
        id: `el_${nanoid(12)}`,
        boardId: initialBoard.id,
        type: "text",
        name: "Texto",
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        width: 360,
        height: 84,
        rotation: 0,
        zIndex: getNextZIndex(elementsRef.current),
        visible: true,
        locked: false,
        opacity: drawDefaults.opacity,
        text: "Escribe aquí...",
        fontSize: drawDefaults.fontSize,
        fontFamily: drawDefaults.fontFamily,
        fontWeight: "bold",
        textAlign: "left",
        textColor: drawDefaults.strokeColor,
        textBgColor: drawDefaults.textBgColor,
        textShadow: drawDefaults.textShadow,
        updatedAt: Date.now(),
      };
      setElements((prev) => [...prev, newText]);
      setSelectedId(newText.id);
      setEditingTextId(newText.id);
      setTool("select");
      void persistUpsert(newText);
      return;
    }

    if (tool === "freehand") {
      const id = `el_${nanoid(12)}`;
      const firstPt: StrokePoint = {
        x: pt.x,
        y: pt.y,
        p: e.pressure || 0.5,
      };
      const norm = normalizeStrokePoints([firstPt]);
      const draft: BoardElement = {
        id,
        boardId: initialBoard.id,
        type: "freehand",
        name: getElementDefaultName("freehand"),
        x: norm.x,
        y: norm.y,
        width: norm.width,
        height: norm.height,
        viewBoxWidth: norm.width,
        viewBoxHeight: norm.height,
        points: norm.points,
        rotation: 0,
        zIndex: getNextZIndex(elementsRef.current),
        visible: true,
        locked: false,
        opacity: drawDefaults.opacity,
        strokeColor: drawDefaults.strokeColor,
        strokeWidth: drawDefaults.strokeWidth,
        updatedAt: Date.now(),
      };
      setDraftElement(draft);
      setSelectedId(null);
      interactionRef.current = {
        kind: "draw-freehand",
        elementId: id,
        rawPoints: [firstPt],
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (
      tool === "rectangle" ||
      tool === "ellipse" ||
      tool === "line" ||
      tool === "arrow"
    ) {
      const id = `el_${nanoid(12)}`;
      const draft: BoardElement = {
        id,
        boardId: initialBoard.id,
        type: tool,
        name: getElementDefaultName(tool),
        x: pt.x,
        y: pt.y,
        width: 4,
        height: 4,
        x2: 4,
        y2: 4,
        rotation: 0,
        zIndex: getNextZIndex(elementsRef.current),
        visible: true,
        locked: false,
        opacity: drawDefaults.opacity,
        strokeColor: drawDefaults.strokeColor,
        fillColor: drawDefaults.fillColor,
        strokeWidth: drawDefaults.strokeWidth,
        strokeStyle: drawDefaults.strokeStyle,
        borderRadius: tool === "rectangle" ? 14 : undefined,
        updatedAt: Date.now(),
      };
      setDraftElement(draft);
      setSelectedId(null);
      interactionRef.current = {
        kind: "draw-shape",
        elementId: id,
        shapeType: tool,
        startX: pt.x,
        startY: pt.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handleElementPointerDown = (
    e: React.PointerEvent,
    el: BoardElement
  ) => {
    if (tool !== "select" || spacePressed || e.button !== 0) return;
    if (editingTextId === el.id) return;
    e.stopPropagation();
    setSelectedId(el.id);
    setEditingTextId(null);

    if (!canEdit || el.locked) return;

    const pt = screenToStage(e.clientX, e.clientY);
    interactionRef.current = {
      kind: "move",
      elementId: el.id,
      startStageX: pt.x,
      startStageY: pt.y,
      origX: el.x,
      origY: el.y,
      moved: false,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    el: BoardElement,
    handle: ResizeHandle
  ) => {
    if (!canEdit || el.locked) return;
    e.stopPropagation();
    const pt = screenToStage(e.clientX, e.clientY);
    pushUndoSnapshot();
    interactionRef.current = {
      kind: "resize",
      elementId: el.id,
      handle,
      startStageX: pt.x,
      startStageY: pt.y,
      orig: {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        x1: el.x1,
        y1: el.y1,
        x2: el.x2,
        y2: el.y2,
      },
      keepAspect: el.type === "image" || el.type === "video",
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handleRotatePointerDown = (e: React.PointerEvent, el: BoardElement) => {
    if (!canEdit || el.locked) return;
    e.stopPropagation();
    const pt = screenToStage(e.clientX, e.clientY);
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    const startAngle = Math.atan2(pt.y - centerY, pt.x - centerX);
    pushUndoSnapshot();
    interactionRef.current = {
      kind: "rotate",
      elementId: el.id,
      centerX,
      centerY,
      startAngle,
      origRotation: el.rotation ?? 0,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    const pt = screenToStage(e.clientX, e.clientY);
    const now = Date.now();

    // Broadcast own collaborator cursor (throttled ~55ms; never sent to OBS)
    if (now - lastCursorSentRef.current > 55) {
      lastCursorSentRef.current = now;
      realtimeRef.current?.sendEphemeral({
        type: "cursor:move",
        senderId: clientId,
        cursor: {
          clientId,
          userId: user.id,
          name: user.name,
          color: user.avatarColor,
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          updatedAt: now,
        },
      });
    }

    const inter = interactionRef.current;
    if (inter.kind === "none") return;

    if (inter.kind === "pan") {
      setPan({
        x: inter.startPanX + (e.clientX - inter.startClientX),
        y: inter.startPanY + (e.clientY - inter.startClientY),
      });
      return;
    }

    if (inter.kind === "move") {
      const dx = pt.x - inter.startStageX;
      const dy = pt.y - inter.startStageY;
      if (!inter.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        pushUndoSnapshot();
        inter.moved = true;
      }
      if (!inter.moved) return;
      const nx = Math.round(inter.origX + dx);
      const ny = Math.round(inter.origY + dy);
      setElements((prev) =>
        prev.map((el) =>
          el.id === inter.elementId ? { ...el, x: nx, y: ny } : el
        )
      );
      if (now - lastLiveBroadcastRef.current > 40) {
        lastLiveBroadcastRef.current = now;
        realtimeRef.current?.sendEphemeral({
          type: "element:patch",
          senderId: clientId,
          elementId: inter.elementId,
          patch: { x: nx, y: ny },
        });
      }
      return;
    }

    if (inter.kind === "resize") {
      const dx = pt.x - inter.startStageX;
      const dy = pt.y - inter.startStageY;
      const { orig, handle } = inter;
      let { x, y, width, height } = orig;

      if (handle.includes("e")) width = Math.max(20, orig.width + dx);
      if (handle.includes("s")) height = Math.max(20, orig.height + dy);
      if (handle.includes("w")) {
        const nextW = Math.max(20, orig.width - dx);
        x = orig.x + (orig.width - nextW);
        width = nextW;
      }
      if (handle.includes("n")) {
        const nextH = Math.max(20, orig.height - dy);
        y = orig.y + (orig.height - nextH);
        height = nextH;
      }

      const lockAspect =
        (inter.keepAspect || e.shiftKey) &&
        (handle === "nw" || handle === "ne" || handle === "se" || handle === "sw");
      if (lockAspect && orig.height > 0) {
        const ratio = orig.width / orig.height;
        height = Math.max(20, width / ratio);
        if (handle.includes("n")) {
          y = orig.y + (orig.height - height);
        }
      }

      const patch: Partial<BoardElement> = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      };
      if (orig.x2 !== undefined && orig.y2 !== undefined) {
        const sx = orig.width > 0 ? width / orig.width : 1;
        const sy = orig.height > 0 ? height / orig.height : 1;
        if (orig.x1 !== undefined) patch.x1 = Math.round(orig.x1 * sx);
        if (orig.y1 !== undefined) patch.y1 = Math.round(orig.y1 * sy);
        patch.x2 = Math.round(orig.x2 * sx);
        patch.y2 = Math.round(orig.y2 * sy);
      }

      setElements((prev) =>
        prev.map((el) => (el.id === inter.elementId ? { ...el, ...patch } : el))
      );
      if (now - lastLiveBroadcastRef.current > 40) {
        lastLiveBroadcastRef.current = now;
        realtimeRef.current?.sendEphemeral({
          type: "element:patch",
          senderId: clientId,
          elementId: inter.elementId,
          patch,
        });
      }
      return;
    }

    if (inter.kind === "rotate") {
      const currentAngle = Math.atan2(
        pt.y - inter.centerY,
        pt.x - inter.centerX
      );
      let deg =
        inter.origRotation + ((currentAngle - inter.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else deg = Math.round(deg);

      setElements((prev) =>
        prev.map((el) =>
          el.id === inter.elementId ? { ...el, rotation: deg } : el
        )
      );
      if (now - lastLiveBroadcastRef.current > 40) {
        lastLiveBroadcastRef.current = now;
        realtimeRef.current?.sendEphemeral({
          type: "element:patch",
          senderId: clientId,
          elementId: inter.elementId,
          patch: { rotation: deg },
        });
      }
      return;
    }

    if (inter.kind === "draw-freehand") {
      const last = inter.rawPoints[inter.rawPoints.length - 1];
      const distSq = (pt.x - last.x) ** 2 + (pt.y - last.y) ** 2;
      if (distSq < 4) return;
      inter.rawPoints.push({ x: pt.x, y: pt.y, p: e.pressure || 0.5 });
      const norm = normalizeStrokePoints(inter.rawPoints);
      setDraftElement((prev) => {
        if (!prev) return null;
        const updated: BoardElement = {
          ...prev,
          x: norm.x,
          y: norm.y,
          width: norm.width,
          height: norm.height,
          viewBoxWidth: norm.width,
          viewBoxHeight: norm.height,
          points: norm.points,
          updatedAt: now,
        };
        if (now - lastLiveBroadcastRef.current > 35) {
          lastLiveBroadcastRef.current = now;
          realtimeRef.current?.sendEphemeral({
            type: "stroke:live",
            senderId: clientId,
            element: updated,
          });
        }
        return updated;
      });
      return;
    }

    if (inter.kind === "draw-shape") {
      const { startX, startY, shapeType } = inter;
      setDraftElement((prev) => {
        if (!prev) return null;
        let updated: BoardElement;
        if (shapeType === "line" || shapeType === "arrow") {
          const minX = Math.min(startX, pt.x);
          const minY = Math.min(startY, pt.y);
          const w = Math.max(4, Math.abs(pt.x - startX));
          const h = Math.max(4, Math.abs(pt.y - startY));
          updated = {
            ...prev,
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(w),
            height: Math.round(h),
            x1: Math.round(startX - minX),
            y1: Math.round(startY - minY),
            x2: Math.round(pt.x - minX),
            y2: Math.round(pt.y - minY),
            updatedAt: now,
          };
        } else {
          let w = Math.abs(pt.x - startX);
          let h = Math.abs(pt.y - startY);
          if (e.shiftKey) {
            const side = Math.max(w, h);
            w = side;
            h = side;
          }
          const x = pt.x < startX ? startX - w : startX;
          const y = pt.y < startY ? startY - h : startY;
          updated = {
            ...prev,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.max(4, Math.round(w)),
            height: Math.max(4, Math.round(h)),
            updatedAt: now,
          };
        }
        if (now - lastLiveBroadcastRef.current > 40) {
          lastLiveBroadcastRef.current = now;
          realtimeRef.current?.sendEphemeral({
            type: "stroke:live",
            senderId: clientId,
            element: updated,
          });
        }
        return updated;
      });
    }
  };

  const handleStagePointerUp = () => {
    const inter = interactionRef.current;
    interactionRef.current = { kind: "none" };

    if (inter.kind === "move" && inter.moved) {
      const finalEl = elementsRef.current.find((e) => e.id === inter.elementId);
      if (finalEl) {
        void persistPatch(finalEl.id, { x: finalEl.x, y: finalEl.y });
      }
      return;
    }

    if (inter.kind === "resize") {
      const finalEl = elementsRef.current.find((e) => e.id === inter.elementId);
      if (finalEl) {
        void persistPatch(finalEl.id, {
          x: finalEl.x,
          y: finalEl.y,
          width: finalEl.width,
          height: finalEl.height,
          x1: finalEl.x1,
          y1: finalEl.y1,
          x2: finalEl.x2,
          y2: finalEl.y2,
        });
      }
      return;
    }

    if (inter.kind === "rotate") {
      const finalEl = elementsRef.current.find((e) => e.id === inter.elementId);
      if (finalEl) {
        void persistPatch(finalEl.id, { rotation: finalEl.rotation });
      }
      return;
    }

    if (inter.kind === "draw-freehand" && draftElement) {
      const finalEl = draftElement;
      setDraftElement(null);
      if ((finalEl.points?.length ?? 0) >= 2) {
        pushUndoSnapshot();
        setElements((prev) => [...prev, finalEl]);
        void persistUpsert(finalEl);
      }
      realtimeRef.current?.sendEphemeral({
        type: "stroke:end",
        senderId: clientId,
        elementId: finalEl.id,
      });
      return;
    }

    if (inter.kind === "draw-shape" && draftElement) {
      const finalEl = draftElement;
      setDraftElement(null);
      const isMeaningful =
        finalEl.type === "line" || finalEl.type === "arrow"
          ? Math.hypot(
              (finalEl.x2 ?? 0) - (finalEl.x1 ?? 0),
              (finalEl.y2 ?? 0) - (finalEl.y1 ?? 0)
            ) > 8
          : finalEl.width > 8 || finalEl.height > 8;

      if (isMeaningful) {
        pushUndoSnapshot();
        setElements((prev) => [...prev, finalEl]);
        setSelectedId(finalEl.id);
        setTool("select");
        void persistUpsert(finalEl);
      }
      realtimeRef.current?.sendEphemeral({
        type: "stroke:end",
        senderId: clientId,
        elementId: finalEl.id,
      });
    }
  };

  // Mouse wheel zoom centered on cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 4) {
      const factor = e.deltaY < 0 ? 1.09 : 0.92;
      const nextZoom = Math.max(0.15, Math.min(3.5, zoom * factor));
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const stageX = (mouseX - pan.x) / zoom;
      const stageY = (mouseY - pan.y) / zoom;
      setZoom(nextZoom);
      setPan({
        x: mouseX - stageX * nextZoom,
        y: mouseY - stageY * nextZoom,
      });
    }
  };

  // Drop media asset or raw file onto canvas
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const dropPos = screenToStage(e.clientX, e.clientY);

    const internalPayload = e.dataTransfer.getData("application/x-obsboard-asset");
    if (internalPayload) {
      try {
        const parsed = JSON.parse(internalPayload) as {
          asset: MediaAsset;
          options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean };
        };
        handleInsertAsset(parsed.asset, parsed.options, dropPos);
      } catch {
        // ignore
      }
      return;
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        const res = await uploadMediaFile(file);
        if (res.asset) {
          setAssets((prev) => [res.asset!, ...prev]);
          handleInsertAsset(
            res.asset,
            { loop: false, autoHideOnEnd: true, muted: false },
            dropPos
          );
        }
      }
    }
  };

  const selectedElement = elements.find((e) => e.id === selectedId) ?? null;

  const backdropClass =
    backdrop === "checker-dark"
      ? "obs-checkerboard"
      : backdrop === "checker-light"
        ? "obs-checkerboard-light"
        : backdrop === "black"
          ? "bg-black"
          : "bg-emerald-600";

  const cursorStyle =
    spacePressed || tool === "hand"
      ? "grab"
      : tool === "select"
        ? "default"
        : tool === "text"
          ? "text"
          : "crosshair";

  return (
    <div className="h-screen w-screen bg-studio-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Studio Top Bar */}
      <header className="h-13 shrink-0 border-b border-studio-800 bg-studio-900/95 px-3 py-2 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            title="Volver a mis tableros"
            className="p-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-300 hover:text-white transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <button
            type="button"
            onClick={() => setShowMediaPanel((v) => !v)}
            title="Mostrar/ocultar biblioteca de clips"
            className={`p-2 rounded-xl border transition shrink-0 ${
              showMediaPanel
                ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                : "bg-studio-850 border-studio-700 text-zinc-400 hover:text-white"
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {editingTitle && canEdit ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleTitleSave();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="rounded-lg bg-studio-950 border border-indigo-500 px-2.5 py-1 text-sm font-semibold text-white outline-none w-56"
            />
          ) : (
            <button
              type="button"
              onClick={() => canEdit && setEditingTitle(true)}
              className="text-sm font-semibold text-white hover:text-indigo-300 truncate max-w-[220px] transition text-left"
              title="Clic para renombrar tablero"
            >
              {title}
            </button>
          )}

          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
              connectionStatus === "connected"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : connectionStatus === "connecting"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {connectionStatus === "disconnected" ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Radio className="w-3 h-3 animate-pulse" />
            )}
            <span>
              {connectionStatus === "connected"
                ? "Sincronizado en vivo"
                : connectionStatus === "connecting"
                  ? "Conectando..."
                  : "Reconectando"}
            </span>
          </span>

          {!canEdit && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
              Solo lectura
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Active remote collaborator avatars */}
          {Object.values(remoteCursors).length > 0 && (
            <div className="hidden md:flex items-center -space-x-1.5 mr-1">
              {Object.values(remoteCursors).map((c) => (
                <div
                  key={c.clientId}
                  title={`${c.name} conectado`}
                  className="w-7 h-7 rounded-full border-2 border-studio-900 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={copyObsUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-studio-850 hover:bg-studio-800 border border-indigo-500/40 text-indigo-200 text-xs font-medium transition"
            title="Copiar enlace transparente para OBS Studio"
          >
            {copiedObs ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">URL OBS copiada</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Copiar URL OBS</span>
              </>
            )}
          </button>

          <a
            href={`/obs/${initialBoard.id}?token=${encodeURIComponent(obsToken)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir vista limpia de OBS en otra pestaña"
            className="p-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-300 hover:text-white transition"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/20"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartir</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRightPanel((v) => !v)}
            title="Mostrar/ocultar panel de capas y propiedades"
            className={`p-2 rounded-xl border transition ${
              showRightPanel
                ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                : "bg-studio-850 border-studio-700 text-zinc-400 hover:text-white"
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Media Library Sidebar */}
        {showMediaPanel && (
          <MediaLibraryPanel
            assets={assets}
            boardElements={elements}
            canEdit={canEdit}
            onAssetUploaded={(asset) => setAssets((prev) => [asset, ...prev])}
            onAssetDeleted={(id) =>
              setAssets((prev) => prev.filter((a) => a.id !== id))
            }
            onInsertAsset={(asset, options) => handleInsertAsset(asset, options)}
            onQuickTriggerExisting={(elId) =>
              handleTriggerVideo(elId, {
                restart: true,
                playing: true,
                visible: true,
              })
            }
          />
        )}

        {/* Infinite Canvas Viewport */}
        <div
          ref={viewportRef}
          className="flex-1 relative overflow-hidden bg-studio-950 touch-none"
          style={{ cursor: cursorStyle }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onWheel={handleWheel}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* Floating Toolbar */}
          <div
            className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-30"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <EditorToolbar
              tool={tool}
              onSelectTool={setTool}
              canEdit={canEdit}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              zoom={zoom}
              onZoomIn={() => setZoom((z) => Math.min(3.5, z * 1.15))}
              onZoomOut={() => setZoom((z) => Math.max(0.15, z * 0.85))}
              onFitStage={fitStageToViewport}
              backdrop={backdrop}
              onBackdropChange={setBackdrop}
            />
          </div>

          {/* Transformed Infinite Stage Layer */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transformOrigin: "0 0",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* 1920x1080 OBS Guide Frame */}
            <div
              className={`relative ${backdropClass}`}
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                boxShadow:
                  "0 0 0 3px rgba(99, 102, 241, 0.75), 0 30px 90px rgba(0, 0, 0, 0.65)",
              }}
            >
              {/* OBS Guide Label (Editor ONLY) */}
              <div
                className="pointer-events-none select-none absolute left-0 flex items-center gap-2.5 px-3 py-1 rounded-t-lg bg-indigo-600/95 text-white font-mono font-semibold tracking-wide whitespace-nowrap"
                style={{
                  bottom: "100%",
                  transformOrigin: "bottom left",
                  transform: `scale(${1 / zoom})`,
                  fontSize: 11,
                }}
              >
                <span>ÁREA OBS • 1920×1080 (16:9)</span>
                <span className="text-indigo-200 font-normal">
                  Fondo 100% transparente en directo
                </span>
              </div>

              {/* Subtle corner guide crosshairs (Editor ONLY) */}
              <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-indigo-400/40" />

              {/* Rendered Board Elements */}
              {elements.map((el) => (
                <StageElement
                  key={el.id}
                  element={el}
                  mode="editor"
                  isEditingText={editingTextId === el.id}
                  onTextChange={(nextText) =>
                    handlePatchElement(el.id, { text: nextText }, false)
                  }
                  onTextBlur={() => {
                    const current = elementsRef.current.find(
                      (i) => i.id === el.id
                    );
                    if (current) {
                      void persistPatch(el.id, { text: current.text });
                    }
                    setEditingTextId(null);
                  }}
                  onVideoAutoHide={(elId) => {
                    handlePatchElement(elId, { visible: false, playing: false });
                  }}
                  onPointerDown={(e) => handleElementPointerDown(e, el)}
                  onDoubleClick={(e) => {
                    if (!canEdit || el.locked) return;
                    if (el.type === "text") {
                      e.stopPropagation();
                      setSelectedId(el.id);
                      setEditingTextId(el.id);
                    }
                  }}
                />
              ))}

              {/* Active Local Draft Element */}
              {draftElement && (
                <StageElement element={draftElement} mode="editor" />
              )}

              {/* Remote Collaborator Live Draft Strokes */}
              {Object.values(remoteDrafts).map((draft) => (
                <StageElement key={draft.id} element={draft} mode="editor" />
              ))}

              {/* Selection & Transform Controls (EDITOR ONLY — NEVER IN OBS) */}
              {selectedElement &&
                selectedElement.visible &&
                canEdit &&
                !selectedElement.locked &&
                editingTextId !== selectedElement.id && (
                  <div
                    className="pointer-events-none"
                    style={{
                      position: "absolute",
                      left: selectedElement.x,
                      top: selectedElement.y,
                      width: Math.max(12, selectedElement.width),
                      height: Math.max(12, selectedElement.height),
                      transform: selectedElement.rotation
                        ? `rotate(${selectedElement.rotation}deg)`
                        : undefined,
                      transformOrigin: "center center",
                      zIndex: 9998,
                    }}
                  >
                    <div
                      className="absolute inset-0 border-2 border-indigo-400"
                      style={{ borderWidth: Math.max(1.5, 2 / zoom) }}
                    />

                    {/* Rotation handle */}
                    <div
                      onPointerDown={(e) =>
                        handleRotatePointerDown(e, selectedElement)
                      }
                      title="Rotar (mantén Shift para 15°)"
                      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 border-2 border-white shadow cursor-grab"
                      style={{
                        top: -34 / zoom,
                        width: 14 / zoom,
                        height: 14 / zoom,
                      }}
                    />

                    {/* 8 Resize handles */}
                    {(
                      [
                        ["nw", 0, 0, "nwse-resize"],
                        ["n", 50, 0, "ns-resize"],
                        ["ne", 100, 0, "nesw-resize"],
                        ["e", 100, 50, "ew-resize"],
                        ["se", 100, 100, "nwse-resize"],
                        ["s", 50, 100, "ns-resize"],
                        ["sw", 0, 100, "nesw-resize"],
                        ["w", 0, 50, "ew-resize"],
                      ] as Array<[ResizeHandle, number, number, string]>
                    ).map(([handle, leftPct, topPct, cursor]) => (
                      <div
                        key={handle}
                        onPointerDown={(e) =>
                          handleResizePointerDown(e, selectedElement, handle)
                        }
                        className="pointer-events-auto absolute rounded-sm bg-white border-2 border-indigo-500 shadow"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: 12 / zoom,
                          height: 12 / zoom,
                          transform: "translate(-50%, -50%)",
                          cursor,
                        }}
                      />
                    ))}
                  </div>
                )}

              {/* Remote Collaborator Cursors (EDITOR ONLY — NEVER IN OBS) */}
              {Object.values(remoteCursors).map((cursor) => (
                <div
                  key={cursor.clientId}
                  className="pointer-events-none select-none absolute"
                  style={{
                    left: cursor.x,
                    top: cursor.y,
                    zIndex: 9999,
                    transform: `scale(${1 / zoom})`,
                    transformOrigin: "0 0",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill={cursor.color}
                    stroke="#ffffff"
                    strokeWidth="2"
                  >
                    <path d="M3 2l7 19 3-8 8-3L3 2z" />
                  </svg>
                  <span
                    className="ml-3 -mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white shadow whitespace-nowrap"
                    style={{ backgroundColor: cursor.color }}
                  >
                    {cursor.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Subtle bottom shortcut hint */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-studio-900/80 border border-studio-800 text-[11px] text-zinc-400 backdrop-blur">
            <span>
              <kbd className="text-zinc-200 font-mono">Espacio</kbd> + arrastrar:
              mover vista
            </span>
            <span>•</span>
            <span>
              <kbd className="text-zinc-200 font-mono">Shift+H</kbd>: ocultar/mostrar
              capa en OBS
            </span>
            <span>•</span>
            <span>Arrastra MP4/WebM/PNG directo al lienzo</span>
          </div>
        </div>

        {/* Right Layers & Inspector Sidebar */}
        {showRightPanel && (
          <LayersInspectorPanel
            elements={elements}
            selectedId={selectedId}
            canEdit={canEdit}
            drawDefaults={drawDefaults}
            onDrawDefaultsChange={setDrawDefaults}
            onSelectElement={(id) => {
              setSelectedId(id);
              setEditingTextId(null);
            }}
            onPatchElement={(id, patch) => handlePatchElement(id, patch, true)}
            onDeleteElement={handleDeleteElement}
            onDuplicateElement={handleDuplicateElement}
            onMoveLayer={handleMoveLayer}
            onTriggerVideo={handleTriggerVideo}
            onHideAllVideos={handleHideAllVideos}
            onShowAllLayers={handleShowAllLayers}
          />
        )}
      </div>

      {/* Share & OBS Modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        boardId={initialBoard.id}
        boardTitle={title}
        obsToken={obsToken}
        myRole={initialBoard.myRole}
        initialMembers={members}
        onObsTokenChange={setObsToken}
        onMembersChange={setMembers}
      />
    </div>
  );
};
