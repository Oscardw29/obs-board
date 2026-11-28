"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  PanelLeft,
  PanelRight,
  PauseCircle,
  Radio,
  Share2,
  ShieldAlert,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/client-media-upload";
import {
  connectBoardRealtime,
  type RealtimeConnection,
} from "@/lib/client-realtime";
import { ensureCustomFontLoaded } from "@/lib/fonts";
import {
  doRectsIntersect,
  doesCircleHitElement,
  getElementWorldBounds,
  getGroupBounds,
  getNextElementName,
  getNextZIndex,
  normalizeStrokePoints,
  splitFreehandStrokeByEraser,
} from "@/lib/geometry";
import {
  computeMoveSnap,
  computeResizeSnap,
  computeRotateSnap,
  type SnapGuide,
} from "@/lib/snap-engine";
import { BoardSyncQueue } from "@/lib/sync-queue";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardBackgroundConfig,
  type BoardDetail,
  type BoardElement,
  type BoardMember,
  type BoardRole,
  type CollaboratorCursor,
  type DocumentPage,
  type MediaAsset,
  type MediaFolder,
  type OnlineMember,
  type RealtimeEvent,
  type StrokePoint,
  type ToolType,
  type User,
} from "@/types/board";
import { type AudioControlUpdate } from "./AudioElementNode";
import { BrandLogo } from "./BrandLogo";
import { CollaboratorsBar } from "./CollaboratorsBar";
import { DocumentAttachModal } from "./DocumentAttachModal";
import {
  EditorToolbar,
  type BoardGuidesConfig,
  type EditorBackdrop,
} from "./EditorToolbar";
import { LeftDockPanel } from "./LeftDockPanel";
import { OnboardingTutorial } from "./OnboardingTutorial";
import { ShareModal } from "./ShareModal";
import { StageElement } from "./StageElement";
import {
  StyleInspectorPanel,
  type DrawDefaults,
} from "./StyleInspectorPanel";

interface BoardEditorProps {
  initialBoard: BoardDetail;
  initialAssets: MediaAsset[];
  initialFolders: MediaFolder[];
  user: User;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type InteractionState =
  | { kind: "none" }
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      kind: "marquee";
      pointerId: number;
      startX: number;
      startY: number;
      curX: number;
      curY: number;
      additive: boolean;
      baseSelectedIds: string[];
    }
  | {
      kind: "move";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startStageX: number;
      startStageY: number;
      clickedElementId?: string;
      items: Array<{ id: string; origX: number; origY: number }>;
      moved: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
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
      pointerId: number;
      elementId: string;
      centerX: number;
      centerY: number;
      startAngle: number;
      origRotation: number;
    }
  | {
      kind: "draw-freehand";
      pointerId: number;
      elementId: string;
      rawPoints: StrokePoint[];
    }
  | {
      kind: "draw-shape";
      pointerId: number;
      elementId: string;
      shapeType: "rectangle" | "ellipse" | "line" | "arrow";
      startX: number;
      startY: number;
    }
  | {
      kind: "erase";
      pointerId: number;
      trail: Array<{ x: number; y: number }>;
      hitIds: Set<string>;
    };

const TUTORIAL_SEEN_KEY = "oboards_tutorial_v1_seen";

export const BoardEditor: React.FC<BoardEditorProps> = ({
  initialBoard,
  initialAssets,
  initialFolders,
  user,
}) => {
  const clientId = useMemo(() => `ed_${nanoid(10)}`, []);

  const [myRole, setMyRole] = useState<BoardRole>(initialBoard.myRole);
  const [myPaused, setMyPaused] = useState<boolean>(
    Boolean(initialBoard.myPaused)
  );
  const [kickedOut, setKickedOut] = useState(false);

  const canEdit = myRole !== "viewer" && !myPaused && !kickedOut;

  const [title, setTitle] = useState(initialBoard.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [obsToken, setObsToken] = useState(initialBoard.obsToken);
  const [members, setMembers] = useState(initialBoard.members);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);

  const [elements, setElements] = useState<BoardElement[]>(initialBoard.elements);
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets);
  const [folders, setFolders] = useState<MediaFolder[]>(initialFolders);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [tool, setTool] = useState<ToolType>("select");
  const [boardBackground, setBoardBackground] = useState<BoardBackgroundConfig>(
    initialBoard.background ?? {}
  );
  const [backdrop, setBackdrop] = useState<EditorBackdrop>(
    initialBoard.background?.imageUrl ? "custom-image" : "checker-dark"
  );
  const [uploadingBgPhoto, setUploadingBgPhoto] = useState(false);
  const [externalDragCount, setExternalDragCount] = useState(0);
  const [dropUploadLabel, setDropUploadLabel] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [copiedObs, setCopiedObs] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Magnet Snap (enabled by default!) & Board Guides
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guidesConfig, setGuidesConfig] = useState<BoardGuidesConfig>({
    enabled: false,
    showCenterAxes: true,
    showRuleOfThirds: true,
    showSafeZones: true,
  });
  const [activeSnapGuides, setActiveSnapGuides] = useState<SnapGuide[]>([]);

  // Marquee rectangle & Eraser live visual state
  const [marqueeBox, setMarqueeBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [eraserCursorPos, setEraserCursorPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [eraserPreviewIds, setEraserPreviewIds] = useState<Set<string>>(
    new Set()
  );

  const [drawDefaults, setDrawDefaults] = useState<DrawDefaults>({
    strokeColor: "#38bdf8",
    fillColor: "transparent",
    strokeWidth: 6,
    strokeStyle: "solid",
    brushType: "pen",
    brushSmoothing: 0.55,
    brushTaper: 0,
    opacity: 1,
    defaultText: "",
    fontFamily: "Plus Jakarta Sans",
    fontSize: 42,
    textBgColor: "rgba(16, 19, 28, 0.8)",
    textShadow: true,
    eraserMode: "object",
    eraserSize: 28,
  });

  const [draftElement, setDraftElement] = useState<BoardElement | null>(null);
  const draftElementRef = useRef<BoardElement | null>(null);

  const [remoteDrafts, setRemoteDrafts] = useState<
    Record<string, { element: BoardElement; receivedAt: number }>
  >({});
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, CollaboratorCursor>
  >({});

  const [undoStack, setUndoStack] = useState<BoardElement[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardElement[][]>([]);

  // Smooth Camera / Zoom State
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState({ zoom: 0.55, x: 80, y: 70 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const targetCameraRef = useRef(camera);
  const cameraRafRef = useRef<number | null>(null);

  const interactionRef = useRef<InteractionState>({ kind: "none" });
  const realtimeRef = useRef<RealtimeConnection | null>(null);
  const syncQueueRef = useRef<BoardSyncQueue | null>(null);
  const elementsRef = useRef<BoardElement[]>(elements);
  elementsRef.current = elements;
  const selectedIdsRef = useRef<string[]>(selectedIds);
  selectedIdsRef.current = selectedIds;
  const editingTextIdRef = useRef<string | null>(editingTextId);
  editingTextIdRef.current = editingTextId;

  const bgStorageKey = `oboards_bg_${initialBoard.id}`;
  useEffect(() => {
    if (initialBoard.background?.imageUrl) return;
    try {
      const raw = localStorage.getItem(bgStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as BoardBackgroundConfig;
        if (parsed?.imageUrl) {
          setBoardBackground(parsed);
          setBackdrop("custom-image");
        }
      }
    } catch {
      // ignore
    }
  }, [bgStorageKey, initialBoard.background?.imageUrl]);

  const lastCursorSentRef = useRef(0);
  const lastLiveBroadcastRef = useRef(0);
  const liveStrokeSeqRef = useRef(0);
  const finalizedDraftsRef = useRef<Map<string, number>>(new Map());
  const remoteStrokeSeqRef = useRef<Map<string, number>>(new Map());
  const patchDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const lastHashRef = useRef("");

  // Show onboarding tutorial once on first run
  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_SEEN_KEY)) {
        const timer = setTimeout(() => setTutorialOpen(true), 450);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  // Load any custom font assets present in the shared library
  const customFonts = useMemo(
    () => assets.filter((a) => a.kind === "font"),
    [assets]
  );
  useEffect(() => {
    for (const f of customFonts) {
      const fam = f.metadata?.fontFamily || f.name;
      void ensureCustomFontLoaded(fam, f.url);
    }
  }, [customFonts]);

  // Smooth camera interpolation loop
  const animateCameraTo = useCallback(
    (next: { zoom: number; x: number; y: number }, immediate = false) => {
      targetCameraRef.current = next;
      if (immediate) {
        if (cameraRafRef.current !== null) {
          cancelAnimationFrame(cameraRafRef.current);
          cameraRafRef.current = null;
        }
        setCamera(next);
        return;
      }

      if (cameraRafRef.current !== null) return;

      const step = () => {
        const cur = cameraRef.current;
        const tgt = targetCameraRef.current;
        const dz = tgt.zoom - cur.zoom;
        const dx = tgt.x - cur.x;
        const dy = tgt.y - cur.y;

        if (
          Math.abs(dz) < 0.0008 &&
          Math.abs(dx) < 0.3 &&
          Math.abs(dy) < 0.3
        ) {
          cameraRafRef.current = null;
          setCamera(tgt);
          return;
        }

        const ease = 0.28;
        setCamera({
          zoom: cur.zoom + dz * ease,
          x: cur.x + dx * ease,
          y: cur.y + dy * ease,
        });
        cameraRafRef.current = requestAnimationFrame(step);
      };

      cameraRafRef.current = requestAnimationFrame(step);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (cameraRafRef.current !== null) {
        cancelAnimationFrame(cameraRafRef.current);
      }
    };
  }, []);

  // Fit 1920x1080 OBS guide frame cleanly inside viewport
  const fitStageToViewport = useCallback(
    (immediate = false) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) return;
      const padX = 56;
      const topReserve = 104;
      const padBottom = 52;
      const availW = Math.max(100, rect.width - padX);
      const availH = Math.max(100, rect.height - topReserve - padBottom);
      const scaleX = availW / STAGE_WIDTH;
      const scaleY = availH / STAGE_HEIGHT;
      const nextZoom = Math.max(0.15, Math.min(1.15, Math.min(scaleX, scaleY)));
      const nextPanX = (rect.width - STAGE_WIDTH * nextZoom) / 2;
      const nextPanY = topReserve + (availH - STAGE_HEIGHT * nextZoom) / 2;
      animateCameraTo({ zoom: nextZoom, x: nextPanX, y: nextPanY }, immediate);
    },
    [animateCameraTo]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1100) {
      setShowLeftPanel(false);
      setShowRightPanel(false);
    }
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    fitStageToViewport(true);
    const ro = new ResizeObserver(() => {
      fitStageToViewport(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitStageToViewport, showLeftPanel, showRightPanel]);

  const screenToStage = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const cam = cameraRef.current;
    return {
      x: (clientX - rect.left - cam.x) / cam.zoom,
      y: (clientY - rect.top - cam.y) / cam.zoom,
    };
  }, []);

  const zoomAtPoint = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tgt = targetCameraRef.current;
      const nextZoom = Math.max(0.15, Math.min(3.5, tgt.zoom * factor));
      const anchorX =
        clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const anchorY =
        clientY !== undefined ? clientY - rect.top : rect.height / 2;
      const stageX = (anchorX - tgt.x) / tgt.zoom;
      const stageY = (anchorY - tgt.y) / tgt.zoom;
      animateCameraTo({
        zoom: nextZoom,
        x: anchorX - stageX * nextZoom,
        y: anchorY - stageY * nextZoom,
      });
    },
    [animateCameraTo]
  );

  // Native non-passive wheel listener for smooth cursor-centered zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 1 && Math.abs(e.deltaX) < 1) return;
      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.pow(1.0018, -delta);
      zoomAtPoint(factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  const pushUndoSnapshot = useCallback((snapshot?: BoardElement[]) => {
    const snap = snapshot ?? elementsRef.current;
    setUndoStack((prev) => [...prev.slice(-39), snap]);
    setRedoStack([]);
  }, []);

  // Refresh shared library on library:updated realtime event
  const refreshSharedLibrary = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/media?boardId=${encodeURIComponent(initialBoard.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        assets?: MediaAsset[];
        folders?: MediaFolder[];
      };
      if (data.assets) setAssets(data.assets);
      if (data.folders) setFolders(data.folders);
    } catch {
      // ignore
    }
  }, [initialBoard.id]);

  // Lightweight reconciliation + permission check
  const resyncBoardSnapshot = useCallback(
    async (force = false) => {
      // Never overwrite elements mid-interaction, mid-text-edit, or while local writes are still syncing
      if (
        !force &&
        (interactionRef.current.kind !== "none" ||
          editingTextIdRef.current !== null ||
          syncQueueRef.current?.hasPendingWork())
      ) {
        return;
      }
      try {
        const hashParam =
          !force && lastHashRef.current
            ? `?hash=${encodeURIComponent(lastHashRef.current)}`
            : "";
        const res = await fetch(
          `/api/boards/${encodeURIComponent(initialBoard.id)}${hashParam}`,
          { cache: "no-store" }
        );
        if (res.status === 404 || res.status === 403) {
          setKickedOut(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          unchanged?: boolean;
          hash?: string;
          myRole?: BoardRole;
          myPaused?: boolean;
          members?: typeof members;
          board?: BoardDetail;
        };
        if (data.hash) lastHashRef.current = data.hash;
        if (data.myRole) setMyRole(data.myRole);
        if (typeof data.myPaused === "boolean") setMyPaused(data.myPaused);
        if (data.members) setMembers(data.members);
        if (
          !data.unchanged &&
          data.board &&
          (force ||
            (interactionRef.current.kind === "none" &&
              editingTextIdRef.current === null &&
              !syncQueueRef.current?.hasPendingWork()))
        ) {
          setElements(data.board.elements);
          setMembers(data.board.members);
          setMyRole(data.board.myRole);
          setMyPaused(Boolean(data.board.myPaused));
          setTitle(data.board.title);
          if (data.board.background !== undefined) {
            setBoardBackground(data.board.background ?? {});
          }
          setRemoteDrafts({});
        }
      } catch {
        // ignore transient network errors
      }
    },
    [initialBoard.id]
  );

  // Sync Queue setup
  useEffect(() => {
    const q = new BoardSyncQueue({
      boardId: initialBoard.id,
      onError: setSaveError,
      onForceResync: () => void resyncBoardSnapshot(true),
    });
    syncQueueRef.current = q;
    return () => {
      q.dispose();
      syncQueueRef.current = null;
    };
  }, [initialBoard.id, resyncBoardSnapshot]);

  // Cancel any active interaction cleanly (called on blur, pointercancel, or when paused!)
  const cancelActiveInteraction = useCallback(() => {
    const inter = interactionRef.current;
    if (inter.kind === "none") return;

    if (
      (inter.kind === "draw-freehand" || inter.kind === "draw-shape") &&
      draftElementRef.current
    ) {
      realtimeRef.current?.sendEphemeral({
        type: "stroke:end",
        senderId: clientId,
        elementId: draftElementRef.current.id,
      });
    }

    interactionRef.current = { kind: "none" };
    draftElementRef.current = null;
    setDraftElement(null);
    setMarqueeBox(null);
    setActiveSnapGuides([]);
    setEraserPreviewIds(new Set());
  }, [clientId]);

  // Persistence helpers via serialized BoardSyncQueue
  const persistUpsert = useCallback(
    (element: BoardElement) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:upsert",
        senderId: clientId,
        element,
      });
      syncQueueRef.current?.enqueue({
        kind: "upsert",
        elementId: element.id,
        payload: { action: "upsert", senderId: clientId, element },
      });
    },
    [clientId]
  );

  const persistUpsertMany = useCallback(
    (els: BoardElement[]) => {
      if (els.length === 0) return;
      realtimeRef.current?.sendPersistedBroadcast({
        type: "elements:upsertMany",
        senderId: clientId,
        elements: els,
      });
      syncQueueRef.current?.enqueue({
        kind: "upsertMany",
        payload: { action: "upsertMany", senderId: clientId, elements: els },
      });
    },
    [clientId]
  );

  const persistPatch = useCallback(
    (elementId: string, patch: Partial<BoardElement>) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:patch",
        senderId: clientId,
        elementId,
        patch,
      });
      syncQueueRef.current?.enqueue({
        kind: "patch",
        elementId,
        payload: { action: "patch", senderId: clientId, elementId, patch },
      });
    },
    [clientId]
  );

  const persistBatchPatch = useCallback(
    (patches: Array<{ elementId: string; patch: Partial<BoardElement> }>) => {
      if (patches.length === 0) return;
      realtimeRef.current?.sendPersistedBroadcast({
        type: "elements:batchPatch",
        senderId: clientId,
        patches,
      });
      syncQueueRef.current?.enqueue({
        kind: "batchPatch",
        payload: { action: "batchPatch", senderId: clientId, patches },
      });
    },
    [clientId]
  );

  const persistDelete = useCallback(
    (elementIds: string[]) => {
      if (elementIds.length === 0) return;
      realtimeRef.current?.sendPersistedBroadcast({
        type: "element:delete",
        senderId: clientId,
        elementIds,
      });
      syncQueueRef.current?.enqueue({
        kind: "delete",
        elementIds,
        payload: { action: "delete", senderId: clientId, elementIds },
      });
    },
    [clientId]
  );

  const persistReplace = useCallback(
    (nextElements: BoardElement[]) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "elements:replace",
        senderId: clientId,
        elements: nextElements,
      });
      syncQueueRef.current?.enqueue({
        kind: "replace",
        payload: {
          action: "replace",
          senderId: clientId,
          elements: nextElements,
        },
      });
    },
    [clientId]
  );

  const broadcastMemberUpdated = useCallback(
    (member: BoardMember) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "member:updated",
        senderId: clientId,
        member,
      });
    },
    [clientId]
  );

  const broadcastMemberKicked = useCallback(
    (payload: {
      memberId: string;
      userId?: string;
      email: string;
      deletedElementIds?: string[];
    }) => {
      realtimeRef.current?.sendPersistedBroadcast({
        type: "member:kicked",
        senderId: clientId,
        ...payload,
      });
      if (payload.deletedElementIds?.length) {
        realtimeRef.current?.sendPersistedBroadcast({
          type: "element:delete",
          senderId: clientId,
          elementIds: payload.deletedElementIds,
        });
      }
    },
    [clientId]
  );

  const broadcastLibraryUpdated = useCallback(() => {
    realtimeRef.current?.sendPersistedBroadcast({
      type: "library:updated",
      senderId: clientId,
      boardId: initialBoard.id,
    });
  }, [clientId, initialBoard.id]);

  // Realtime subscription
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
      boardId: initialBoard.id,
      clientId,
      presenceUser: {
        clientId,
        userId: user.id,
        email: user.email,
        name: user.name,
        color: user.avatarColor,
        role: initialBoard.myRole,
        paused: Boolean(initialBoard.myPaused),
        connectedAt: Date.now(),
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          void resyncBoardSnapshot(false);
        }
      },
      onPresenceChange: setOnlineMembers,
      onEvent: (event: RealtimeEvent) => {
        switch (event.type) {
          case "elements:replace":
            setElements(event.elements);
            setRemoteDrafts({});
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
            setRemoteDrafts((prev) => {
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
            setSelectedIds((curr) => curr.filter((id) => !set.has(id)));
            setRemoteDrafts((prev) => {
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
          case "stroke:live": {
            if (isRecentlyFinalized(event.element.id)) return;
            if (typeof event.seq === "number") {
              const prevSeq =
                remoteStrokeSeqRef.current.get(event.element.id) ?? -1;
              if (event.seq <= prevSeq) return;
              remoteStrokeSeqRef.current.set(event.element.id, event.seq);
            }
            setRemoteDrafts((prev) => ({
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
            if (event.title !== undefined) setTitle(event.title);
            if (event.background !== undefined) {
              setBoardBackground(event.background ?? {});
              if (event.background?.imageUrl) {
                setBackdrop("custom-image");
              }
            }
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
          case "member:updated": {
            setMembers((prev) => {
              const exists = prev.some((m) => m.id === event.member.id);
              return exists
                ? prev.map((m) => (m.id === event.member.id ? event.member : m))
                : [...prev, event.member];
            });
            const isMe =
              event.member.userId === user.id ||
              event.member.email.toLowerCase() === user.email.toLowerCase();
            if (isMe) {
              setMyRole(event.member.role);
              const nextPaused = Boolean(event.member.paused);
              setMyPaused(nextPaused);
              if (nextPaused || event.member.role === "viewer") {
                cancelActiveInteraction();
                setEditingTextId(null);
              }
              realtimeRef.current?.updatePresence({
                role: event.member.role,
                paused: nextPaused,
              });
            }
            break;
          }
          case "member:kicked": {
            if (event.deletedElementIds?.length) {
              const delSet = new Set(event.deletedElementIds);
              setElements((prev) => prev.filter((e) => !delSet.has(e.id)));
              setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
            }
            setMembers((prev) => prev.filter((m) => m.id !== event.memberId));
            const isMe =
              event.userId === user.id ||
              event.email.toLowerCase() === user.email.toLowerCase();
            if (isMe) {
              cancelActiveInteraction();
              setKickedOut(true);
            }
            break;
          }
          case "library:updated":
            void refreshSharedLibrary();
            break;
        }
      },
    });

    realtimeRef.current = conn;

    // Prune stale remote cursors and drafts every 2.5s
    const pruneInterval = setInterval(() => {
      const cursorCutoff = Date.now() - 12000;
      setRemoteCursors((prev) => {
        let changed = false;
        const next: Record<string, CollaboratorCursor> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.updatedAt >= cursorCutoff) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });

      const draftCutoff = Date.now() - 5000;
      setRemoteDrafts((prev) => {
        let changed = false;
        const next: Record<string, { element: BoardElement; receivedAt: number }> =
          {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.receivedAt >= draftCutoff) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 2500);

    // Periodic lightweight hash reconciliation every 15s
    const reconcileTimer = setInterval(() => {
      void resyncBoardSnapshot(false);
    }, 15000);

    return () => {
      clearInterval(pruneInterval);
      clearInterval(reconcileTimer);
      conn.sendEphemeral({
        type: "cursor:leave",
        senderId: clientId,
        clientId,
      });
      conn.close();
      realtimeRef.current = null;
    };
  }, [
    cancelActiveInteraction,
    clientId,
    initialBoard.id,
    initialBoard.myPaused,
    initialBoard.myRole,
    refreshSharedLibrary,
    resyncBoardSnapshot,
    user.avatarColor,
    user.email,
    user.id,
    user.name,
  ]);

  // Global window blur & visibility safeguard (prevents sticky spacebar or stuck drags)
  useEffect(() => {
    const onBlur = () => {
      setSpacePressed(false);
      cancelActiveInteraction();
    };
    const onVisChange = () => {
      if (document.visibilityState !== "visible") {
        setSpacePressed(false);
        cancelActiveInteraction();
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [cancelActiveInteraction]);

  // Prevent browser from opening dropped files in the tab if dropped outside a specific zone
  useEffect(() => {
    const preventFileNav = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    window.addEventListener("dragover", preventFileNav);
    window.addEventListener("drop", preventFileNav);
    return () => {
      window.removeEventListener("dragover", preventFileNav);
      window.removeEventListener("drop", preventFileNav);
    };
  }, []);

  // Element Mutations
  const handlePatchElement = useCallback(
    (id: string, patch: Partial<BoardElement>, immediate = true) => {
      if (!canEdit) return;
      setElements((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
        )
      );

      if (immediate) {
        persistPatch(id, patch);
      } else {
        const existingTimer = patchDebounceRef.current.get(id);
        if (existingTimer) clearTimeout(existingTimer);
        patchDebounceRef.current.set(
          id,
          setTimeout(() => {
            persistPatch(id, patch);
            patchDebounceRef.current.delete(id);
          }, 140)
        );
      }
    },
    [canEdit, persistPatch]
  );

  const handleBatchPatch = useCallback(
    (patches: Array<{ elementId: string; patch: Partial<BoardElement> }>) => {
      if (!canEdit || patches.length === 0) return;
      pushUndoSnapshot();
      const map = new Map(patches.map((p) => [p.elementId, p.patch]));
      const now = Date.now();
      setElements((prev) =>
        prev.map((el) => {
          const p = map.get(el.id);
          return p ? { ...el, ...p, updatedAt: now } : el;
        })
      );
      persistBatchPatch(patches);
    },
    [canEdit, persistBatchPatch, pushUndoSnapshot]
  );

  const handleDeleteElements = useCallback(
    (ids: string[]) => {
      if (!canEdit || ids.length === 0) return;
      pushUndoSnapshot();
      const delSet = new Set(ids);
      setElements((prev) => prev.filter((e) => !delSet.has(e.id)));
      setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
      if (editingTextId && delSet.has(editingTextId)) {
        setEditingTextId(null);
      }
      persistDelete(ids);
    },
    [canEdit, editingTextId, persistDelete, pushUndoSnapshot]
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
        name: getNextElementName(orig.type, elementsRef.current),
        x: orig.x + 36,
        y: orig.y + 36,
        zIndex: getNextZIndex(elementsRef.current),
        createdByUserId: user.id,
        createdByEmail: user.email,
        createdByName: user.name,
        updatedAt: Date.now(),
      };
      setElements((prev) => [...prev, copy]);
      setSelectedIds([copy.id]);
      persistUpsert(copy);
    },
    [canEdit, persistUpsert, pushUndoSnapshot, user.email, user.id, user.name]
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
      persistReplace(reindexed);
    },
    [canEdit, persistReplace, pushUndoSnapshot]
  );

  const handleReorderLayer = useCallback(
    (draggedId: string, targetId: string) => {
      if (!canEdit || draggedId === targetId) return;
      const sortedDesc = [...elementsRef.current].sort(
        (a, b) => b.zIndex - a.zIndex
      );
      const fromIdx = sortedDesc.findIndex((e) => e.id === draggedId);
      const toIdx = sortedDesc.findIndex((e) => e.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;

      pushUndoSnapshot();
      const [moved] = sortedDesc.splice(fromIdx, 1);
      sortedDesc.splice(toIdx, 0, moved);
      const total = sortedDesc.length;
      const reindexed = sortedDesc
        .map((el, i) => ({
          ...el,
          zIndex: total - i,
          updatedAt: Date.now(),
        }))
        .sort((a, b) => a.zIndex - b.zIndex);
      setElements(reindexed);
      persistReplace(reindexed);
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

      syncQueueRef.current?.enqueue({
        kind: "triggerVideo",
        elementId,
        payload: {
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
        },
      });
    },
    [canEdit, clientId]
  );

  const handleControlAudio = useCallback(
    (elementId: string, update: AudioControlUpdate) => {
      if (!canEdit) return;
      const el = elementsRef.current.find((e) => e.id === elementId);
      if (!el || el.type !== "audio") return;

      const now = Date.now();
      const nextSeekId = `ask_${nanoid(8)}`;
      const nextLoop = update.loop !== undefined ? update.loop : el.loop;
      const nextMuted = update.muted !== undefined ? update.muted : el.muted;
      const nextVolume = update.volume !== undefined ? update.volume : el.volume;

      setElements((prev) =>
        prev.map((item) =>
          item.id === elementId
            ? {
                ...item,
                playing: update.playing,
                currentTimeSec: update.currentTimeSec,
                triggeredAt: now,
                seekId: nextSeekId,
                loop: nextLoop,
                muted: nextMuted,
                volume: nextVolume,
                updatedAt: now,
              }
            : item
        )
      );

      const evt: RealtimeEvent = {
        type: "audio:control",
        senderId: clientId,
        elementId,
        playing: update.playing,
        currentTimeSec: update.currentTimeSec,
        triggeredAt: now,
        seekId: nextSeekId,
        loop: nextLoop,
        muted: nextMuted,
        volume: nextVolume,
      };

      if (update.commit === false) {
        realtimeRef.current?.sendEphemeral(evt);
        return;
      }

      realtimeRef.current?.sendPersistedBroadcast(evt);
      syncQueueRef.current?.enqueue({
        kind: "controlAudio",
        elementId,
        payload: {
          action: "controlAudio",
          senderId: clientId,
          elementId,
          playing: update.playing,
          currentTimeSec: update.currentTimeSec,
          triggeredAt: now,
          seekId: nextSeekId,
          loop: nextLoop,
          muted: nextMuted,
          volume: nextVolume,
        },
      });
    },
    [canEdit, clientId]
  );

  const handleAudioWaveformDecoded = useCallback(
    (elementId: string, peaks: number[], durationSec?: number) => {
      const patch: Partial<BoardElement> = { waveformPeaks: peaks };
      if (durationSec && durationSec > 0) patch.durationSec = durationSec;
      setElements((prev) =>
        prev.map((e) => (e.id === elementId ? { ...e, ...patch } : e))
      );
      if (canEdit) {
        persistPatch(elementId, patch);
      }
    },
    [canEdit, persistPatch]
  );

  const handleUpdateBoardBackground = useCallback(
    async (nextBg: BoardBackgroundConfig) => {
      if (!canEdit) return;
      setBoardBackground(nextBg);
      try {
        if (nextBg.imageUrl) {
          localStorage.setItem(bgStorageKey, JSON.stringify(nextBg));
        } else {
          localStorage.removeItem(bgStorageKey);
        }
      } catch {
        // ignore
      }
      realtimeRef.current?.sendPersistedBroadcast({
        type: "board:meta",
        senderId: clientId,
        background: nextBg,
      });
      try {
        await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ background: nextBg, senderId: clientId }),
        });
      } catch {
        // ignore transient network errors
      }
    },
    [bgStorageKey, canEdit, clientId, initialBoard.id]
  );

  const handleUploadBgPhoto = useCallback(
    async (file: File) => {
      if (!canEdit) return;
      setUploadingBgPhoto(true);
      try {
        const res = await uploadMediaFile(file, { boardId: initialBoard.id });
        if (res.error || !res.asset) {
          setSaveError(res.error || "No se pudo subir la foto de fondo.");
          return;
        }
        if (res.asset.kind !== "image") {
          setSaveError("Selecciona una imagen (PNG, JPG, WebP, GIF) para el fondo.");
          return;
        }
        setAssets((prev) => [
          res.asset!,
          ...prev.filter((a) => a.id !== res.asset!.id),
        ]);
        broadcastLibraryUpdated();
        const nextBg: BoardBackgroundConfig = {
          imageUrl: res.asset.url,
          fit: boardBackground.fit ?? "cover",
          opacity: boardBackground.opacity ?? 1,
          showInObs: boardBackground.showInObs ?? false,
        };
        setBackdrop("custom-image");
        await handleUpdateBoardBackground(nextBg);
      } finally {
        setUploadingBgPhoto(false);
      }
    },
    [
      boardBackground.fit,
      boardBackground.opacity,
      boardBackground.showInObs,
      broadcastLibraryUpdated,
      canEdit,
      handleUpdateBoardBackground,
      initialBoard.id,
    ]
  );

  const handleInsertAsset = useCallback(
    (
      asset: MediaAsset,
      options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean },
      dropPos?: { x: number; y: number }
    ) => {
      if (!canEdit) return;
      if (asset.kind === "font") return;

      pushUndoSnapshot();
      const now = Date.now();

      if (asset.kind === "audio") {
        const width = 540;
        const height = 220;
        const x = dropPos
          ? Math.round(dropPos.x - width / 2)
          : Math.round((STAGE_WIDTH - width) / 2);
        const y = dropPos
          ? Math.round(dropPos.y - height / 2)
          : Math.round((STAGE_HEIGHT - height) / 2);

        const audioEl: BoardElement = {
          id: `el_${nanoid(12)}`,
          boardId: initialBoard.id,
          type: "audio",
          name: getNextElementName("audio", elementsRef.current, asset.name),
          x,
          y,
          width,
          height,
          rotation: 0,
          zIndex: getNextZIndex(elementsRef.current),
          visible: true,
          locked: false,
          opacity: 1,
          src: asset.url,
          mediaAssetId: asset.id,
          durationSec: asset.durationSec,
          currentTimeSec: 0,
          seekId: `ask_${nanoid(8)}`,
          triggeredAt: now,
          waveformPeaks: asset.metadata?.waveformPeaks,
          waveformColor: "#fb923c",
          playing: false,
          loop: options.loop,
          muted: options.muted,
          volume: 0.85,
          createdByUserId: user.id,
          createdByEmail: user.email,
          createdByName: user.name,
          updatedAt: now,
        };
        setElements((prev) => [...prev, audioEl]);
        setSelectedIds([audioEl.id]);
        setTool("select");
        persistUpsert(audioEl);
        return;
      }

      if (asset.kind === "document" && asset.metadata?.documentPages?.length) {
        const first = asset.metadata.documentPages[0];
        const ratio = (first.width || 600) / (first.height || 800);
        const height = Math.min(760, Math.max(360, first.height || 700));
        const width = Math.round(height * ratio);
        const x = dropPos
          ? Math.round(dropPos.x - width / 2)
          : Math.round((STAGE_WIDTH - width) / 2);
        const y = dropPos
          ? Math.round(dropPos.y - height / 2)
          : Math.round((STAGE_HEIGHT - height) / 2);

        const docEl: BoardElement = {
          id: `el_${nanoid(12)}`,
          boardId: initialBoard.id,
          type: "document",
          name: getNextElementName("document", elementsRef.current, asset.name),
          x,
          y,
          width,
          height,
          rotation: 0,
          zIndex: getNextZIndex(elementsRef.current),
          visible: true,
          locked: false,
          opacity: 1,
          documentTitle: asset.name,
          documentPages: asset.metadata.documentPages,
          currentPage: 1,
          mediaAssetId: asset.id,
          objectFit: "contain",
          createdByUserId: user.id,
          createdByEmail: user.email,
          createdByName: user.name,
          updatedAt: now,
        };
        setElements((prev) => [...prev, docEl]);
        setSelectedIds([docEl.id]);
        setTool("select");
        persistUpsert(docEl);
        return;
      }

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

      const type = asset.kind === "video" ? "video" : "image";
      const effectiveLoop = options.autoHideOnEnd ? false : options.loop;

      const newEl: BoardElement = {
        id: `el_${nanoid(12)}`,
        boardId: initialBoard.id,
        type,
        name: getNextElementName(type, elementsRef.current, asset.name),
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
        createdByUserId: user.id,
        createdByEmail: user.email,
        createdByName: user.name,
        ...(asset.kind === "video"
          ? {
              playing: true,
              loop: effectiveLoop,
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
      setSelectedIds([newEl.id]);
      setTool("select");
      persistUpsert(newEl);
    },
    [
      canEdit,
      initialBoard.id,
      persistUpsert,
      pushUndoSnapshot,
      user.email,
      user.id,
      user.name,
    ]
  );

  const handleDocumentInserted = useCallback(
    (
      mode: "single" | "separate",
      docTitle: string,
      pages: DocumentPage[],
      asset?: MediaAsset
    ) => {
      if (!canEdit || pages.length === 0) return;
      if (asset) {
        setAssets((prev) => [
          asset,
          ...prev.filter((a) => a.id !== asset.id),
        ]);
        broadcastLibraryUpdated();
      }

      pushUndoSnapshot();
      const now = Date.now();
      let nextZ = getNextZIndex(elementsRef.current);

      if (mode === "single") {
        const first = pages[0];
        const ratio = (first.width || 600) / (first.height || 800);
        const height = Math.min(780, Math.max(400, first.height || 720));
        const width = Math.round(height * ratio);
        const el: BoardElement = {
          id: `el_${nanoid(12)}`,
          boardId: initialBoard.id,
          type: "document",
          name: getNextElementName("document", elementsRef.current, docTitle),
          x: Math.round((STAGE_WIDTH - width) / 2),
          y: Math.round((STAGE_HEIGHT - height) / 2),
          width,
          height,
          rotation: 0,
          zIndex: nextZ,
          visible: true,
          locked: false,
          opacity: 1,
          documentTitle: docTitle,
          documentPages: pages,
          currentPage: 1,
          mediaAssetId: asset?.id,
          objectFit: "contain",
          createdByUserId: user.id,
          createdByEmail: user.email,
          createdByName: user.name,
          updatedAt: now,
        };
        setElements((prev) => [...prev, el]);
        setSelectedIds([el.id]);
        setTool("select");
        persistUpsert(el);
        return;
      }

      const created: BoardElement[] = [];
      let currentEls = [...elementsRef.current];
      pages.forEach((pg, idx) => {
        const ratio = (pg.width || 600) / (pg.height || 800);
        const height = 680;
        const width = Math.round(height * ratio);
        const offset = idx * 38;
        const el: BoardElement = {
          id: `el_${nanoid(12)}`,
          boardId: initialBoard.id,
          type: "image",
          name: getNextElementName(
            "image",
            currentEls,
            `${docTitle} Pág ${pg.pageNumber}`
          ),
          x: Math.round((STAGE_WIDTH - width) / 2 + offset),
          y: Math.round((STAGE_HEIGHT - height) / 2 + offset),
          width,
          height,
          rotation: 0,
          zIndex: nextZ++,
          visible: true,
          locked: false,
          opacity: 1,
          src: pg.url,
          aspectRatio: ratio,
          objectFit: "contain",
          createdByUserId: user.id,
          createdByEmail: user.email,
          createdByName: user.name,
          updatedAt: now,
        };
        created.push(el);
        currentEls.push(el);
      });

      setElements((prev) => [...prev, ...created]);
      setSelectedIds(created.map((c) => c.id));
      setTool("select");
      persistUpsertMany(created);
    },
    [
      canEdit,
      initialBoard.id,
      persistUpsert,
      persistUpsertMany,
      pushUndoSnapshot,
      user.email,
      user.id,
      user.name,
    ]
  );

  const handleApplyFontAsset = useCallback(
    (asset: MediaAsset) => {
      const fam = asset.metadata?.fontFamily || asset.name;
      void ensureCustomFontLoaded(fam, asset.url);
      const selectedTextIds = selectedIdsRef.current.filter((id) => {
        const el = elementsRef.current.find((item) => item.id === id);
        return el?.type === "text";
      });
      if (selectedTextIds.length > 0 && canEdit) {
        handleBatchPatch(
          selectedTextIds.map((id) => ({
            elementId: id,
            patch: {
              fontFamily: fam,
              customFontName: fam,
              customFontUrl: asset.url,
            },
          }))
        );
      } else {
        setDrawDefaults((prev) => ({
          ...prev,
          fontFamily: fam,
          customFontName: fam,
          customFontUrl: asset.url,
        }));
      }
    },
    [canEdit, handleBatchPatch]
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
    persistReplace(next);
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
    persistReplace(next);
  }, [canEdit, persistReplace, pushUndoSnapshot]);

  const handleAuthorVisibility = useCallback(
    (target: { userId?: string; email?: string }, visible: boolean) => {
      if (myRole !== "owner") return;
      const now = Date.now();
      const patches: Array<{ elementId: string; patch: Partial<BoardElement> }> =
        [];
      setElements((prev) =>
        prev.map((el) => {
          const match =
            (target.userId && el.createdByUserId === target.userId) ||
            (target.email &&
              el.createdByEmail?.toLowerCase() === target.email.toLowerCase());
          if (!match) return el;
          patches.push({ elementId: el.id, patch: { visible } });
          return { ...el, visible, updatedAt: now };
        })
      );
      if (patches.length > 0) {
        realtimeRef.current?.sendPersistedBroadcast({
          type: "elements:batchPatch",
          senderId: clientId,
          patches,
        });
      }
      syncQueueRef.current?.enqueue({
        kind: "authorVisibility",
        payload: {
          action: "authorVisibility",
          senderId: clientId,
          userId: target.userId,
          email: target.email,
          visible,
        },
      });
    },
    [clientId, myRole]
  );

  const handleAuthorDelete = useCallback(
    (target: { userId?: string; email?: string }) => {
      if (myRole !== "owner") return;
      pushUndoSnapshot();
      const deletedIds: string[] = [];
      setElements((prev) =>
        prev.filter((el) => {
          const match =
            (target.userId && el.createdByUserId === target.userId) ||
            (target.email &&
              el.createdByEmail?.toLowerCase() === target.email.toLowerCase());
          if (match) deletedIds.push(el.id);
          return !match;
        })
      );
      if (deletedIds.length > 0) {
        const delSet = new Set(deletedIds);
        setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
        realtimeRef.current?.sendPersistedBroadcast({
          type: "element:delete",
          senderId: clientId,
          elementIds: deletedIds,
        });
      }
      syncQueueRef.current?.enqueue({
        kind: "authorDelete",
        payload: {
          action: "authorDelete",
          senderId: clientId,
          userId: target.userId,
          email: target.email,
        },
      });
    },
    [clientId, myRole, pushUndoSnapshot]
  );

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (!canEdit || undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r.slice(-39), elementsRef.current]);
    setElements(prevSnapshot);
    persistReplace(prevSnapshot);
  }, [canEdit, persistReplace, undoStack]);

  const handleRedo = useCallback(() => {
    if (!canEdit || redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u.slice(-39), elementsRef.current]);
    setElements(nextSnapshot);
    persistReplace(nextSnapshot);
  }, [canEdit, persistReplace, redoStack]);

  // Keyboard shortcuts (NO 'H' hand tool!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.code === "Space" && !isInput) {
        e.preventDefault();
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
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(elementsRef.current.map((item) => item.id));
        return;
      }
      if (
        mod &&
        e.key.toLowerCase() === "d" &&
        selectedIdsRef.current.length === 1
      ) {
        e.preventDefault();
        handleDuplicateElement(selectedIdsRef.current[0]);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        fitStageToViewport();
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIdsRef.current.length > 0 &&
        canEdit
      ) {
        e.preventDefault();
        handleDeleteElements(selectedIdsRef.current);
        return;
      }

      if (e.key === "Escape") {
        cancelActiveInteraction();
        setSelectedIds([]);
        setEditingTextId(null);
        setTool("select");
        return;
      }

      if (
        e.shiftKey &&
        e.key.toLowerCase() === "h" &&
        selectedIdsRef.current.length > 0 &&
        canEdit
      ) {
        handleBatchPatch(
          selectedIdsRef.current.map((id) => {
            const el = elementsRef.current.find((item) => item.id === id);
            return { elementId: id, patch: { visible: !(el?.visible ?? true) } };
          })
        );
        return;
      }

      if (e.key === "Enter" && selectedIdsRef.current.length === 1 && canEdit) {
        const sel = elementsRef.current.find(
          (item) => item.id === selectedIdsRef.current[0]
        );
        if (sel && sel.type === "text" && !sel.locked) {
          e.preventDefault();
          setEditingTextId(sel.id);
          return;
        }
      }

      if (
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight") &&
        selectedIdsRef.current.length > 0 &&
        canEdit
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const patches = selectedIdsRef.current
          .map((id) => elementsRef.current.find((item) => item.id === id))
          .filter((el): el is BoardElement => Boolean(el && !el.locked))
          .map((el) => ({
            elementId: el.id,
            patch: { x: Math.round(el.x + dx), y: Math.round(el.y + dy) },
          }));
        if (patches.length > 0) handleBatchPatch(patches);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "v") setTool("select");
      else if (key === "e" && canEdit) setTool("eraser");
      else if (key === "p" && canEdit) setTool("freehand");
      else if (key === "r" && canEdit) setTool("rectangle");
      else if (key === "o" && canEdit) setTool("ellipse");
      else if (key === "l" && canEdit) setTool("line");
      else if (key === "a" && canEdit) setTool("arrow");
      else if (key === "t" && canEdit) {
        setTool("text");
        setSelectedIds([]);
        setEditingTextId(null);
        setShowRightPanel(true);
      }
      else if (key === "m") setSnapEnabled((v) => !v);
      else if (key === "g")
        setGuidesConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
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
    cancelActiveInteraction,
    fitStageToViewport,
    handleBatchPatch,
    handleDeleteElements,
    handleDuplicateElement,
    handleRedo,
    handleUndo,
  ]);

  // Title save
  const handleTitleSave = async () => {
    setEditingTitle(false);
    const clean = title.trim() || "Tablero OBoardS";
    setTitle(clean);
    realtimeRef.current?.sendPersistedBroadcast({
      type: "board:meta",
      senderId: clientId,
      title: clean,
    });
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(initialBoard.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: clean, senderId: clientId }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(data.error || "No se pudo guardar el título del tablero.");
      }
    } catch {
      setSaveError("No se pudo guardar el título del tablero (error de red).");
    }
  };

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

  const capturePointerSafe = useCallback((pointerId: number) => {
    try {
      viewportRef.current?.setPointerCapture(pointerId);
    } catch {
      // Window-level pointer listeners guarantee drag completion even without capture
    }
  }, []);

  const createTextElement = useCallback(
    (x: number, y: number, customText?: string) => {
      if (!canEdit) return;
      pushUndoSnapshot();
      const textVal =
        customText !== undefined
          ? customText
          : drawDefaults.defaultText.trim() || "Nuevo texto";
      const newText: BoardElement = {
        id: `el_${nanoid(12)}`,
        boardId: initialBoard.id,
        type: "text",
        name: getNextElementName("text", elementsRef.current),
        x: Math.round(x),
        y: Math.round(y),
        width: 420,
        height: 92,
        rotation: 0,
        zIndex: getNextZIndex(elementsRef.current),
        visible: true,
        locked: false,
        opacity: drawDefaults.opacity,
        text: textVal,
        fontSize: drawDefaults.fontSize,
        fontFamily: drawDefaults.fontFamily,
        customFontName: drawDefaults.customFontName,
        customFontUrl: drawDefaults.customFontUrl,
        fontWeight: "bold",
        textAlign: "left",
        textColor: drawDefaults.strokeColor,
        textBgColor: drawDefaults.textBgColor,
        textShadow: drawDefaults.textShadow,
        createdByUserId: user.id,
        createdByEmail: user.email,
        createdByName: user.name,
        updatedAt: Date.now(),
      };
      setElements((prev) => [...prev, newText]);
      setSelectedIds([newText.id]);
      setShowRightPanel(true);
      setEditingTextId(newText.id);
      setTool("select");
      persistUpsert(newText);
    },
    [
      canEdit,
      drawDefaults,
      initialBoard.id,
      persistUpsert,
      pushUndoSnapshot,
      user.email,
      user.id,
      user.name,
    ]
  );

  const handleInsertTextFromPanel = useCallback(
    (text: string) => {
      createTextElement((STAGE_WIDTH - 420) / 2, (STAGE_HEIGHT - 92) / 2, text);
    },
    [createTextElement]
  );

  // Pointer handlers
  const handleStagePointerDown = (e: React.PointerEvent) => {
    // Middle click or Space+Click pans canvas
    if (e.button === 1 || (e.button === 0 && spacePressed)) {
      e.preventDefault();
      interactionRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: cameraRef.current.x,
        startPanY: cameraRef.current.y,
      };
      capturePointerSafe(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    const pt = screenToStage(e.clientX, e.clientY);

    // Select tool on empty canvas -> Marquee drag selection
    if (tool === "select") {
      e.preventDefault();
      setEditingTextId(null);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const base = additive ? [...selectedIdsRef.current] : [];
      if (!additive) setSelectedIds([]);
      setMarqueeBox({ x: pt.x, y: pt.y, width: 0, height: 0 });
      interactionRef.current = {
        kind: "marquee",
        pointerId: e.pointerId,
        startX: pt.x,
        startY: pt.y,
        curX: pt.x,
        curY: pt.y,
        additive,
        baseSelectedIds: base,
      };
      capturePointerSafe(e.pointerId);
      return;
    }

    if (!canEdit) return;

    // Eraser tool
    if (tool === "eraser") {
      e.preventDefault();
      const hitSet = new Set<string>();
      const radius = drawDefaults.eraserSize / 2;
      for (const el of elementsRef.current) {
        if (!el.locked && doesCircleHitElement(pt.x, pt.y, radius, el)) {
          hitSet.add(el.id);
        }
      }
      setEraserPreviewIds(new Set(hitSet));
      interactionRef.current = {
        kind: "erase",
        pointerId: e.pointerId,
        trail: [{ x: pt.x, y: pt.y }],
        hitIds: hitSet,
      };
      capturePointerSafe(e.pointerId);
      return;
    }

    // Text tool
    if (tool === "text") {
      e.preventDefault();
      createTextElement(pt.x, pt.y);
      return;
    }

    // Brush / Freehand tool
    if (tool === "freehand") {
      e.preventDefault();
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
        name: getNextElementName("freehand", elementsRef.current),
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
        brushType: drawDefaults.brushType,
        brushSmoothing: drawDefaults.brushSmoothing,
        brushTaper: drawDefaults.brushTaper,
        createdByUserId: user.id,
        createdByEmail: user.email,
        createdByName: user.name,
        updatedAt: Date.now(),
      };
      draftElementRef.current = draft;
      setDraftElement(draft);
      setSelectedIds([]);
      liveStrokeSeqRef.current = 0;
      interactionRef.current = {
        kind: "draw-freehand",
        pointerId: e.pointerId,
        elementId: id,
        rawPoints: [firstPt],
      };
      capturePointerSafe(e.pointerId);
      return;
    }

    // Shape tools
    if (
      tool === "rectangle" ||
      tool === "ellipse" ||
      tool === "line" ||
      tool === "arrow"
    ) {
      e.preventDefault();
      const id = `el_${nanoid(12)}`;
      const draft: BoardElement = {
        id,
        boardId: initialBoard.id,
        type: tool,
        name: getNextElementName(tool, elementsRef.current),
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
        createdByUserId: user.id,
        createdByEmail: user.email,
        createdByName: user.name,
        updatedAt: Date.now(),
      };
      draftElementRef.current = draft;
      setDraftElement(draft);
      setSelectedIds([]);
      liveStrokeSeqRef.current = 0;
      interactionRef.current = {
        kind: "draw-shape",
        pointerId: e.pointerId,
        elementId: id,
        shapeType: tool,
        startX: pt.x,
        startY: pt.y,
      };
      capturePointerSafe(e.pointerId);
    }
  };

  const handleElementPointerDown = (
    e: React.PointerEvent,
    el: BoardElement
  ) => {
    if (spacePressed || e.button !== 0) return;

    // Clicking an existing text element while Text tool is active -> edit it directly!
    if (tool === "text" && el.type === "text" && canEdit && !el.locked) {
      e.stopPropagation();
      e.preventDefault();
      setSelectedIds([el.id]);
      setEditingTextId(el.id);
      setTool("select");
      return;
    }

    if (tool !== "select") return;
    if (editingTextId === el.id) return;
    e.stopPropagation();
    e.preventDefault();

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let nextSelected: string[];

    if (additive) {
      if (selectedIdsRef.current.includes(el.id)) {
        nextSelected = selectedIdsRef.current.filter((id) => id !== el.id);
      } else {
        nextSelected = [...selectedIdsRef.current, el.id];
      }
      setSelectedIds(nextSelected);
      setEditingTextId(null);
      return;
    }

    if (selectedIdsRef.current.includes(el.id)) {
      nextSelected = selectedIdsRef.current;
    } else {
      nextSelected = [el.id];
      setSelectedIds(nextSelected);
    }
    setEditingTextId(null);

    if (!canEdit || el.locked) return;

    const pt = screenToStage(e.clientX, e.clientY);
    const itemsToMove = elementsRef.current
      .filter((item) => nextSelected.includes(item.id) && !item.locked)
      .map((item) => ({ id: item.id, origX: item.x, origY: item.y }));

    if (itemsToMove.length === 0) return;

    interactionRef.current = {
      kind: "move",
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startStageX: pt.x,
      startStageY: pt.y,
      clickedElementId: el.id,
      items: itemsToMove,
      moved: false,
    };
    capturePointerSafe(e.pointerId);
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    el: BoardElement,
    handle: ResizeHandle
  ) => {
    if (!canEdit || el.locked || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = screenToStage(e.clientX, e.clientY);
    pushUndoSnapshot();
    interactionRef.current = {
      kind: "resize",
      pointerId: e.pointerId,
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
      keepAspect:
        el.type === "image" || el.type === "video" || el.type === "document",
    };
    capturePointerSafe(e.pointerId);
  };

  const handleRotatePointerDown = (e: React.PointerEvent, el: BoardElement) => {
    if (!canEdit || el.locked || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = screenToStage(e.clientX, e.clientY);
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    const startAngle = Math.atan2(pt.y - centerY, pt.x - centerX);
    pushUndoSnapshot();
    interactionRef.current = {
      kind: "rotate",
      pointerId: e.pointerId,
      elementId: el.id,
      centerX,
      centerY,
      startAngle,
      origRotation: el.rotation ?? 0,
    };
    capturePointerSafe(e.pointerId);
  };

  const finishInteraction = useCallback(
    (pointerId?: number) => {
      const inter = interactionRef.current;
      if (inter.kind === "none") return;
      if (pointerId !== undefined && inter.pointerId !== pointerId) return;

      interactionRef.current = { kind: "none" };
      setActiveSnapGuides([]);

      try {
        if (
          pointerId !== undefined &&
          viewportRef.current?.hasPointerCapture(pointerId)
        ) {
          viewportRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }

      if (inter.kind === "marquee") {
        setMarqueeBox(null);
        return;
      }

      if (inter.kind === "move") {
        if (inter.moved) {
          const patches: Array<{ elementId: string; patch: Partial<BoardElement> }> =
            [];
          for (const item of inter.items) {
            const finalEl = elementsRef.current.find((el) => el.id === item.id);
            if (finalEl) {
              patches.push({
                elementId: finalEl.id,
                patch: { x: finalEl.x, y: finalEl.y },
              });
            }
          }
          if (patches.length === 1) {
            persistPatch(patches[0].elementId, patches[0].patch);
          } else if (patches.length > 1) {
            persistBatchPatch(patches);
          }
        } else if (inter.clickedElementId && canEdit) {
          // Direct single click on a text element (without dragging) opens inline text editor!
          const clickedEl = elementsRef.current.find(
            (el) => el.id === inter.clickedElementId
          );
          if (
            clickedEl &&
            clickedEl.type === "text" &&
            !clickedEl.locked &&
            selectedIdsRef.current.length === 1 &&
            selectedIdsRef.current[0] === clickedEl.id
          ) {
            setEditingTextId(clickedEl.id);
          }
        }
        return;
      }

      if (inter.kind === "resize") {
        const finalEl = elementsRef.current.find(
          (e) => e.id === inter.elementId
        );
        if (finalEl) {
          persistPatch(finalEl.id, {
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
        const finalEl = elementsRef.current.find(
          (e) => e.id === inter.elementId
        );
        if (finalEl) {
          persistPatch(finalEl.id, { rotation: finalEl.rotation });
        }
        return;
      }

      if (inter.kind === "erase") {
        setEraserPreviewIds(new Set());
        const radius = drawDefaults.eraserSize / 2;

        if (drawDefaults.eraserMode === "object") {
          const toDelete = Array.from(inter.hitIds);
          if (toDelete.length > 0) {
            handleDeleteElements(toDelete);
          }
          return;
        }

        // Partial stroke erase mode
        const toDelete: string[] = [];
        const fragmentsToCreate: BoardElement[] = [];
        let workingEls = [...elementsRef.current];
        let nextZ = getNextZIndex(workingEls);

        for (const el of elementsRef.current) {
          if (el.locked) continue;
          if (el.type === "freehand") {
            const split = splitFreehandStrokeByEraser(el, inter.trail, radius);
            if (!split.hit) continue;
            toDelete.push(el.id);
            for (const run of split.survivingWorldRuns) {
              const norm = normalizeStrokePoints(run);
              const frag: BoardElement = {
                ...el,
                id: `el_${nanoid(12)}`,
                name: getNextElementName("freehand", workingEls),
                x: norm.x,
                y: norm.y,
                width: norm.width,
                height: norm.height,
                viewBoxWidth: norm.width,
                viewBoxHeight: norm.height,
                points: norm.points,
                rotation: 0,
                zIndex: nextZ++,
                updatedAt: Date.now(),
              };
              fragmentsToCreate.push(frag);
              workingEls.push(frag);
            }
          } else if (inter.hitIds.has(el.id)) {
            toDelete.push(el.id);
          }
        }

        if (toDelete.length > 0 || fragmentsToCreate.length > 0) {
          pushUndoSnapshot();
          const delSet = new Set(toDelete);
          const nextElements = [
            ...elementsRef.current.filter((e) => !delSet.has(e.id)),
            ...fragmentsToCreate,
          ];
          setElements(nextElements);
          setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
          persistReplace(nextElements);
        }
        return;
      }

      if (inter.kind === "draw-freehand" && draftElementRef.current) {
        const finalEl = draftElementRef.current;
        draftElementRef.current = null;
        setDraftElement(null);
        if ((finalEl.points?.length ?? 0) >= 2) {
          pushUndoSnapshot();
          setElements((prev) => [...prev, finalEl]);
          persistUpsert(finalEl);
        }
        realtimeRef.current?.sendEphemeral({
          type: "stroke:end",
          senderId: clientId,
          elementId: finalEl.id,
        });
        return;
      }

      if (inter.kind === "draw-shape" && draftElementRef.current) {
        const finalEl = draftElementRef.current;
        draftElementRef.current = null;
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
          setSelectedIds([finalEl.id]);
          setTool("select");
          persistUpsert(finalEl);
        }
        realtimeRef.current?.sendEphemeral({
          type: "stroke:end",
          senderId: clientId,
          elementId: finalEl.id,
        });
      }
    },
    [
      canEdit,
      clientId,
      drawDefaults.eraserMode,
      drawDefaults.eraserSize,
      handleDeleteElements,
      persistBatchPatch,
      persistPatch,
      persistReplace,
      persistUpsert,
      pushUndoSnapshot,
    ]
  );

  const handlePointerMoveCore = (e: {
    clientX: number;
    clientY: number;
    pointerId: number;
    pointerType: string;
    buttons: number;
    altKey: boolean;
    shiftKey: boolean;
    pressure: number;
  }) => {
    const pt = screenToStage(e.clientX, e.clientY);
    const now = Date.now();

    if (tool === "eraser") {
      setEraserCursorPos(pt);
    } else if (eraserCursorPos) {
      setEraserCursorPos(null);
    }

    // Broadcast collaborator cursor
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

    // Safeguard against stuck drags if mouse button was released outside viewport
    if (e.pointerType === "mouse" && e.buttons === 0) {
      finishInteraction(inter.pointerId);
      return;
    }

    if (inter.pointerId !== e.pointerId) return;

    if (inter.kind === "pan") {
      animateCameraTo(
        {
          zoom: cameraRef.current.zoom,
          x: inter.startPanX + (e.clientX - inter.startClientX),
          y: inter.startPanY + (e.clientY - inter.startClientY),
        },
        true
      );
      return;
    }

    if (inter.kind === "marquee") {
      inter.curX = pt.x;
      inter.curY = pt.y;
      const left = Math.min(inter.startX, pt.x);
      const top = Math.min(inter.startY, pt.y);
      const width = Math.abs(pt.x - inter.startX);
      const height = Math.abs(pt.y - inter.startY);
      setMarqueeBox({ x: left, y: top, width, height });

      if (width > 3 || height > 3) {
        const box = {
          left,
          top,
          right: left + width,
          bottom: top + height,
        };
        const hitIds = elementsRef.current
          .filter(
            (el) => !el.locked && doRectsIntersect(box, getElementWorldBounds(el))
          )
          .map((el) => el.id);
        const merged = Array.from(new Set([...inter.baseSelectedIds, ...hitIds]));
        setSelectedIds(merged);
      }
      return;
    }

    if (inter.kind === "erase") {
      inter.trail.push({ x: pt.x, y: pt.y });
      const radius = drawDefaults.eraserSize / 2;
      let changed = false;
      for (const el of elementsRef.current) {
        if (!el.locked && doesCircleHitElement(pt.x, pt.y, radius, el)) {
          if (!inter.hitIds.has(el.id)) {
            inter.hitIds.add(el.id);
            changed = true;
          }
        }
      }
      if (changed) {
        setEraserPreviewIds(new Set(inter.hitIds));
      }
      return;
    }

    if (inter.kind === "move") {
      const rawDx = pt.x - inter.startStageX;
      const rawDy = pt.y - inter.startStageY;
      const screenDist = Math.hypot(
        e.clientX - inter.startClientX,
        e.clientY - inter.startClientY
      );
      if (!inter.moved && screenDist > 3) {
        pushUndoSnapshot();
        inter.moved = true;
      }
      if (!inter.moved) return;

      let finalDx = rawDx;
      let finalDy = rawDy;

      if (snapEnabled && !e.altKey) {
        const movingOrig = inter.items
          .map((item) => {
            const base = elementsRef.current.find((el) => el.id === item.id);
            return base ? { ...base, x: item.origX, y: item.origY } : null;
          })
          .filter(Boolean) as BoardElement[];

        const snapped = computeMoveSnap({
          movingElements: movingOrig,
          allElements: elementsRef.current,
          deltaX: rawDx,
          deltaY: rawDy,
          zoom: cameraRef.current.zoom,
          includeGuides: guidesConfig.enabled,
        });
        finalDx = snapped.dx;
        finalDy = snapped.dy;
        setActiveSnapGuides(snapped.guides);
      } else {
        setActiveSnapGuides([]);
      }

      const movedMap = new Map(
        inter.items.map((item) => [
          item.id,
          {
            x: Math.round(item.origX + finalDx),
            y: Math.round(item.origY + finalDy),
          },
        ])
      );

      setElements((prev) =>
        prev.map((el) => {
          const nextPos = movedMap.get(el.id);
          return nextPos ? { ...el, x: nextPos.x, y: nextPos.y } : el;
        })
      );

      if (now - lastLiveBroadcastRef.current > 40) {
        lastLiveBroadcastRef.current = now;
        const patches = Array.from(movedMap.entries()).map(
          ([elementId, pos]) => ({
            elementId,
            patch: { x: pos.x, y: pos.y },
          })
        );
        if (patches.length === 1) {
          realtimeRef.current?.sendEphemeral({
            type: "element:patch",
            senderId: clientId,
            elementId: patches[0].elementId,
            patch: patches[0].patch,
          });
        } else if (patches.length > 1) {
          realtimeRef.current?.sendEphemeral({
            type: "elements:batchPatch",
            senderId: clientId,
            patches,
          });
        }
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
        (handle === "nw" ||
          handle === "ne" ||
          handle === "se" ||
          handle === "sw");
      if (lockAspect && orig.height > 0) {
        const ratio = orig.width / orig.height;
        height = Math.max(20, width / ratio);
        if (handle.includes("n")) {
          y = orig.y + (orig.height - height);
        }
      }

      if (snapEnabled && !e.altKey) {
        const snapped = computeResizeSnap({
          elementId: inter.elementId,
          handle,
          box: { x, y, width, height },
          allElements: elementsRef.current,
          zoom: cameraRef.current.zoom,
          keepAspect: lockAspect,
          includeGuides: guidesConfig.enabled,
        });
        x = snapped.x;
        y = snapped.y;
        width = snapped.width;
        height = snapped.height;
        setActiveSnapGuides(snapped.guides);
      } else {
        setActiveSnapGuides([]);
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
        prev.map((el) =>
          el.id === inter.elementId ? { ...el, ...patch } : el
        )
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
      const rawDeg =
        inter.origRotation +
        ((currentAngle - inter.startAngle) * 180) / Math.PI;
      const deg = computeRotateSnap(rawDeg, snapEnabled && !e.altKey, e.shiftKey);

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
      const prev = draftElementRef.current;
      if (!prev) return;
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
      draftElementRef.current = updated;
      setDraftElement(updated);

      if (now - lastLiveBroadcastRef.current > 35) {
        lastLiveBroadcastRef.current = now;
        liveStrokeSeqRef.current += 1;
        realtimeRef.current?.sendEphemeral({
          type: "stroke:live",
          senderId: clientId,
          seq: liveStrokeSeqRef.current,
          element: updated,
        });
      }
      return;
    }

    if (inter.kind === "draw-shape") {
      const { startX, startY, shapeType } = inter;
      const prev = draftElementRef.current;
      if (!prev) return;
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

      draftElementRef.current = updated;
      setDraftElement(updated);

      if (now - lastLiveBroadcastRef.current > 40) {
        lastLiveBroadcastRef.current = now;
        liveStrokeSeqRef.current += 1;
        realtimeRef.current?.sendEphemeral({
          type: "stroke:live",
          senderId: clientId,
          seq: liveStrokeSeqRef.current,
          element: updated,
        });
      }
    }
  };

  // Window-level pointer fallback ensures dragging NEVER stalls or gets stuck even if pointer leaves canvas or loses capture
  const pointerMoveCoreRef = useRef(handlePointerMoveCore);
  pointerMoveCoreRef.current = handlePointerMoveCore;
  const finishInteractionRef = useRef(finishInteraction);
  finishInteractionRef.current = finishInteraction;

  useEffect(() => {
    const onWinMove = (e: PointerEvent) => {
      if (interactionRef.current.kind === "none") return;
      if (viewportRef.current?.hasPointerCapture(e.pointerId)) return;
      pointerMoveCoreRef.current(e);
    };
    const onWinUp = (e: PointerEvent) => {
      if (interactionRef.current.kind === "none") return;
      finishInteractionRef.current(e.pointerId);
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    return () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
  }, []);

  const handleStagePointerMove = (e: React.PointerEvent) => {
    handlePointerMoveCore(e);
  };

  // Unified external file import helper (works from dropping anywhere in the app!)
  const importExternalFiles = useCallback(
    async (files: FileList | File[], dropPos?: { x: number; y: number }) => {
      if (!canEdit) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      let uploadedCount = 0;
      setDropUploadLabel(
        list.length === 1
          ? `Importando ${list[0].name}…`
          : `Importando ${list.length} archivos…`
      );
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i];
          const lower = file.name.toLowerCase();
          if (
            lower.endsWith(".pdf") ||
            lower.endsWith(".txt") ||
            lower.endsWith(".md") ||
            file.type === "application/pdf"
          ) {
            setPendingDocFile(file);
            setDocModalOpen(true);
            continue;
          }

          const res = await uploadMediaFile(file, { boardId: initialBoard.id });
          if (res.error) {
            setSaveError(res.error);
          } else if (res.asset) {
            uploadedCount++;
            setAssets((prev) => [
              res.asset!,
              ...prev.filter((a) => a.id !== res.asset!.id),
            ]);
            broadcastLibraryUpdated();
            if (res.asset.kind === "font") {
              handleApplyFontAsset(res.asset);
            } else {
              const staggeredPos = dropPos
                ? { x: dropPos.x + i * 36, y: dropPos.y + i * 36 }
                : {
                    x: STAGE_WIDTH / 2 + i * 36,
                    y: STAGE_HEIGHT / 2 + i * 36,
                  };
              handleInsertAsset(
                res.asset,
                {
                  loop: false,
                  autoHideOnEnd: res.asset.kind === "video",
                  muted: false,
                },
                staggeredPos
              );
            }
          }
        }
      } finally {
        setDropUploadLabel(null);
      }
      if (uploadedCount > 0) {
        setSaveError(null);
      }
    },
    [
      broadcastLibraryUpdated,
      canEdit,
      handleApplyFontAsset,
      handleInsertAsset,
      initialBoard.id,
    ]
  );

  // Drop media asset, document, font, audio, or external file onto canvas
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExternalDragCount(0);
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
      await importExternalFiles(files, dropPos);
    }
  };

  const isExternalFileDrag = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return (
      types.includes("Files") &&
      !types.includes("application/x-obsboard-asset") &&
      !types.includes("application/x-oboards-move-asset") &&
      !types.includes("application/x-oboards-layer")
    );
  };

  const handleRootDragEnter = (e: React.DragEvent) => {
    if (!canEdit || !isExternalFileDrag(e)) return;
    e.preventDefault();
    setExternalDragCount((c) => c + 1);
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!canEdit || !isExternalFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    if (!isExternalFileDrag(e)) return;
    setExternalDragCount((c) => Math.max(0, c - 1));
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    setExternalDragCount(0);
    if (!canEdit || !isExternalFileDrag(e)) return;
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await importExternalFiles(files);
    }
  };

  const selectedElements = useMemo(() => {
    const set = new Set(selectedIds);
    return elements.filter((e) => set.has(e.id));
  }, [elements, selectedIds]);

  const singleSelected =
    selectedElements.length === 1 ? selectedElements[0] : null;
  const multiBounds = useMemo(
    () =>
      selectedElements.length > 1 ? getGroupBounds(selectedElements) : null,
    [selectedElements]
  );

  const imageAssets = useMemo(
    () => assets.filter((a) => a.kind === "image"),
    [assets]
  );

  const backdropClass =
    backdrop === "checker-dark"
      ? "obs-checkerboard"
      : backdrop === "checker-light"
        ? "obs-checkerboard-light"
        : backdrop === "black"
          ? "bg-black"
          : backdrop === "custom-image"
            ? "obs-checkerboard"
            : "bg-emerald-600";

  const cursorStyle = spacePressed
    ? "grab"
    : tool === "eraser"
      ? "none"
      : tool === "select"
        ? "default"
        : tool === "text"
          ? "text"
          : "crosshair";

  return (
    <div
      className="h-screen w-screen bg-studio-950 text-zinc-100 flex flex-col overflow-hidden relative"
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {/* Full-app Drag & Drop File Import Overlay */}
      {externalDragCount > 0 && canEdit && (
        <div className="pointer-events-none fixed inset-0 z-[180] bg-sky-950/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-3xl border-2 border-dashed border-sky-400 bg-studio-900/95 p-8 text-center space-y-3 shadow-[0_0_80px_rgba(56,189,248,0.28)]">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center mx-auto text-sky-300">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white">
              Suelta tus archivos para importarlos
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Imágenes (PNG, JPG, WebP, GIF), Videos (MP4, WebM, MOV), Audios
              (MP3, WAV, OGG, M4A), Documentos (PDF, TXT, MD) o Fuentes
              (TTF, OTF, WOFF).
            </p>
            <p className="text-[11px] text-sky-300 font-medium">
              Suelta sobre el área 16:9 para colocarlos al instante, o sobre la
              Biblioteca para guardarlos.
            </p>
          </div>
        </div>
      )}

      {/* Upload Progress Toast for Drag-and-Drop */}
      {dropUploadLabel && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[170] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-studio-900/95 border border-sky-400/45 text-xs text-sky-100 shadow-2xl backdrop-blur">
          <UploadCloud className="w-4 h-4 text-sky-400 animate-bounce" />
          <span className="font-medium">{dropUploadLabel}</span>
        </div>
      )}
      {/* Kicked Out Overlay */}
      {kickedOut && (
        <div className="fixed inset-0 z-[200] bg-studio-950/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-studio-900 border border-rose-500/35 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">
                Acceso revocado
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                El creador del tablero te ha retirado el acceso a este espacio.
              </p>
            </div>
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
            >
              Volver a mis tableros
            </Link>
          </div>
        </div>
      )}

      {/* Studio Top Bar */}
      <header className="h-14 shrink-0 border-b border-white/[0.07] bg-studio-900/95 px-3 py-2 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/"
            title="Volver a mis tableros"
            aria-label="Volver a mis tableros"
            className="p-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <button
            type="button"
            onClick={() => setShowLeftPanel((v) => !v)}
            title="Mostrar/ocultar Capas y Biblioteca"
            aria-label="Alternar panel izquierdo"
            className={`p-2 rounded-xl border transition-colors shrink-0 ${
              showLeftPanel
                ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                : "bg-studio-850 border-white/[0.08] text-zinc-400 hover:text-white"
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="hidden md:flex items-center pr-1.5 border-r border-white/[0.08]">
            <BrandLogo size="sm" />
          </div>

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
              className="rounded-lg bg-studio-950 border border-sky-400 px-2.5 py-1 text-sm font-semibold text-white outline-none w-48"
            />
          ) : (
            <button
              type="button"
              onClick={() => canEdit && setEditingTitle(true)}
              className="text-sm font-semibold text-white hover:text-sky-300 truncate max-w-[180px] transition-colors text-left"
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
            <span className="hidden lg:inline">
              {connectionStatus === "connected"
                ? "En vivo"
                : connectionStatus === "connecting"
                  ? "Conectando…"
                  : "Reconectando"}
            </span>
          </span>

          {myPaused && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 border border-amber-400/40 text-amber-200 animate-pulse">
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Pausado (Solo lectura)</span>
            </span>
          )}

          {!myPaused && myRole === "viewer" && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
              Solo lectura
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <CollaboratorsBar
            boardId={initialBoard.id}
            ownerId={initialBoard.ownerId}
            ownerName={initialBoard.ownerName}
            ownerEmail={initialBoard.ownerEmail}
            myRole={myRole}
            members={members}
            onlineMembers={onlineMembers}
            elements={elements}
            onMembersChange={setMembers}
            onAuthorVisibility={handleAuthorVisibility}
            onAuthorDelete={handleAuthorDelete}
            onMemberElementsDeleted={(ids) => {
              const delSet = new Set(ids);
              setElements((prev) => prev.filter((e) => !delSet.has(e.id)));
              setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
            }}
            onBroadcastMemberUpdated={broadcastMemberUpdated}
            onBroadcastMemberKicked={broadcastMemberKicked}
            onOpenShareModal={() => setShareOpen(true)}
          />

          <button
            type="button"
            onClick={copyObsUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-studio-850 hover:bg-studio-800 border border-sky-400/35 text-sky-200 text-xs font-medium transition-colors"
            title="Copiar enlace transparente para OBS Studio"
          >
            {copiedObs ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">URL OBS copiada</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Copiar URL OBS</span>
              </>
            )}
          </button>

          <a
            href={`/obs/${initialBoard.id}?token=${encodeURIComponent(obsToken)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir vista limpia de OBS en otra pestaña"
            aria-label="Abrir vista limpia OBS"
            className="p-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-md shadow-sky-600/20"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compartir</span>
          </button>

          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            title="Ver tutorial rápido"
            aria-label="Abrir guía tutorial"
            className="p-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-sky-300 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowRightPanel((v) => !v)}
            title="Mostrar/ocultar panel de Estilo, Animación y Presets"
            aria-label="Alternar panel derecho"
            className={`p-2 rounded-xl border transition-colors ${
              showRightPanel
                ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                : "bg-studio-850 border-white/[0.08] text-zinc-400 hover:text-white"
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Dock: Capas & Biblioteca Compartida */}
        {showLeftPanel && (
          <LeftDockPanel
            boardId={initialBoard.id}
            elements={elements}
            selectedIds={selectedIds}
            assets={assets}
            folders={folders}
            canEdit={canEdit}
            onSelectElements={(ids) => {
              setSelectedIds(ids);
              setEditingTextId(null);
            }}
            onPatchElement={(id, patch) => handlePatchElement(id, patch, true)}
            onDeleteElements={handleDeleteElements}
            onDuplicateElement={handleDuplicateElement}
            onMoveLayer={handleMoveLayer}
            onReorderLayer={handleReorderLayer}
            onTriggerVideo={handleTriggerVideo}
            onControlAudio={handleControlAudio}
            onHideAllVideos={handleHideAllVideos}
            onShowAllLayers={handleShowAllLayers}
            onAssetUploaded={(asset) => {
              setAssets((prev) => [
                asset,
                ...prev.filter((a) => a.id !== asset.id),
              ]);
              broadcastLibraryUpdated();
            }}
            onAssetUpdated={(asset) => {
              setAssets((prev) =>
                prev.map((a) => (a.id === asset.id ? asset : a))
              );
              broadcastLibraryUpdated();
            }}
            onAssetDeleted={(id) => {
              setAssets((prev) => prev.filter((a) => a.id !== id));
              broadcastLibraryUpdated();
            }}
            onFolderCreated={(folder) => {
              setFolders((prev) => [...prev, folder]);
              broadcastLibraryUpdated();
            }}
            onFolderUpdated={(folder) => {
              setFolders((prev) =>
                prev.map((f) => (f.id === folder.id ? folder : f))
              );
              broadcastLibraryUpdated();
            }}
            onFolderDeleted={(folderId) => {
              setFolders((prev) => prev.filter((f) => f.id !== folderId));
              setAssets((prev) =>
                prev.map((a) =>
                  a.folderId === folderId ? { ...a, folderId: null } : a
                )
              );
              broadcastLibraryUpdated();
            }}
            onInsertAsset={(asset, options) => handleInsertAsset(asset, options)}
            onApplyFontAsset={handleApplyFontAsset}
            onOpenDocumentModal={() => {
              setPendingDocFile(null);
              setDocModalOpen(true);
            }}
          />
        )}

        {/* Infinite Canvas Viewport */}
        <div
          ref={viewportRef}
          data-tour="stage"
          className="flex-1 relative overflow-hidden bg-studio-950 touch-none select-none"
          style={{ cursor: cursorStyle }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={(e) => finishInteraction(e.pointerId)}
          onPointerCancel={(e) => finishInteraction(e.pointerId)}
          onPointerLeave={() => setEraserCursorPos(null)}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
        >
          {/* Floating Toolbar */}
          <div
            className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] flex justify-center z-30"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <EditorToolbar
              tool={tool}
              onSelectTool={(nextTool) => {
                setTool(nextTool);
                if (nextTool !== "eraser") setEraserCursorPos(null);
                if (nextTool === "text") {
                  setSelectedIds([]);
                  setEditingTextId(null);
                  setShowRightPanel(true);
                }
              }}
              canEdit={canEdit}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              zoom={camera.zoom}
              onZoomIn={() => zoomAtPoint(1.18)}
              onZoomOut={() => zoomAtPoint(0.84)}
              onFitStage={() => fitStageToViewport(false)}
              backdrop={backdrop}
              onBackdropChange={setBackdrop}
              boardBackground={boardBackground}
              imageAssets={imageAssets}
              uploadingBgPhoto={uploadingBgPhoto}
              onUploadBgPhoto={handleUploadBgPhoto}
              onUpdateBoardBackground={handleUpdateBoardBackground}
              snapEnabled={snapEnabled}
              onToggleSnap={() => setSnapEnabled((v) => !v)}
              guidesConfig={guidesConfig}
              onGuidesConfigChange={setGuidesConfig}
              onOpenDocumentModal={() => {
                setPendingDocFile(null);
                setDocModalOpen(true);
              }}
            />
          </div>

          {saveError && (
            <div
              className="absolute bottom-4 right-4 z-40 max-w-md flex items-center justify-between gap-3 rounded-xl border border-rose-500/50 bg-studio-900/95 px-3.5 py-2.5 text-xs text-rose-200 shadow-2xl backdrop-blur"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>{saveError}</span>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-rose-300 hover:text-white font-medium shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Transformed Infinite Stage Layer */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transformOrigin: "0 0",
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            }}
          >
            {/* 1920x1080 OBS Guide Frame */}
            <div
              className={`relative ${backdropClass}`}
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                boxShadow:
                  "0 0 0 2px rgba(56, 189, 248, 0.72), 0 30px 90px rgba(0, 0, 0, 0.7)",
              }}
            >
              {/* Custom Photo Background Layer */}
              {backdrop === "custom-image" && boardBackground.imageUrl && (
                <img
                  src={boardBackground.imageUrl}
                  alt="Fondo personalizado"
                  draggable={false}
                  className="pointer-events-none select-none absolute inset-0 w-full h-full"
                  style={{
                    objectFit: boardBackground.fit ?? "cover",
                    opacity: boardBackground.opacity ?? 1,
                    zIndex: 0,
                  }}
                />
              )}

              {/* OBS Guide Label (Editor ONLY) */}
              <div
                className="pointer-events-none select-none absolute left-0 flex items-center gap-2.5 px-3 py-1 rounded-t-lg bg-sky-600/95 text-white font-mono font-semibold tracking-wide whitespace-nowrap"
                style={{
                  bottom: "100%",
                  transformOrigin: "bottom left",
                  transform: `scale(${1 / camera.zoom})`,
                  fontSize: 11,
                }}
              >
                <span>ÁREA OBS · 1920×1080 (16:9)</span>
                <span className="text-sky-100/90 font-normal">
                  {boardBackground.imageUrl && boardBackground.showInObs
                    ? "Fondo foto personalizado activo en OBS"
                    : "Fondo 100% transparente en directo"}
                </span>
              </div>

              <div className="pointer-events-none absolute inset-0 border border-dashed border-sky-400/35" />

              {/* Optional Board Guides Overlay (Editor ONLY — NEVER IN OBS) */}
              {guidesConfig.enabled && (
                <svg
                  width={STAGE_WIDTH}
                  height={STAGE_HEIGHT}
                  viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
                  className="pointer-events-none absolute inset-0"
                  style={{ zIndex: 9990 }}
                >
                  {guidesConfig.showCenterAxes && (
                    <g
                      stroke="rgba(56, 189, 248, 0.45)"
                      strokeWidth={1.5 / camera.zoom}
                      strokeDasharray={`${8 / camera.zoom} ${6 / camera.zoom}`}
                    >
                      <line x1={STAGE_WIDTH / 2} y1={0} x2={STAGE_WIDTH / 2} y2={STAGE_HEIGHT} />
                      <line x1={0} y1={STAGE_HEIGHT / 2} x2={STAGE_WIDTH} y2={STAGE_HEIGHT / 2} />
                    </g>
                  )}
                  {guidesConfig.showRuleOfThirds && (
                    <g
                      stroke="rgba(148, 163, 184, 0.28)"
                      strokeWidth={1 / camera.zoom}
                      strokeDasharray={`${5 / camera.zoom} ${5 / camera.zoom}`}
                    >
                      <line x1={STAGE_WIDTH / 3} y1={0} x2={STAGE_WIDTH / 3} y2={STAGE_HEIGHT} />
                      <line x1={(STAGE_WIDTH * 2) / 3} y1={0} x2={(STAGE_WIDTH * 2) / 3} y2={STAGE_HEIGHT} />
                      <line x1={0} y1={STAGE_HEIGHT / 3} x2={STAGE_WIDTH} y2={STAGE_HEIGHT / 3} />
                      <line x1={0} y1={(STAGE_HEIGHT * 2) / 3} x2={STAGE_WIDTH} y2={(STAGE_HEIGHT * 2) / 3} />
                    </g>
                  )}
                  {guidesConfig.showSafeZones && (
                    <rect
                      x={STAGE_WIDTH * 0.05}
                      y={STAGE_HEIGHT * 0.05}
                      width={STAGE_WIDTH * 0.9}
                      height={STAGE_HEIGHT * 0.9}
                      fill="none"
                      stroke="rgba(16, 185, 129, 0.35)"
                      strokeWidth={1.5 / camera.zoom}
                      strokeDasharray={`${10 / camera.zoom} ${6 / camera.zoom}`}
                    />
                  )}
                </svg>
              )}

              {/* Rendered Board Elements */}
              {elements.map((el) => {
                const markedErase = eraserPreviewIds.has(el.id);
                return (
                  <StageElement
                    key={el.id}
                    element={
                      markedErase ? { ...el, opacity: (el.opacity ?? 1) * 0.3 } : el
                    }
                    mode="editor"
                    zoom={camera.zoom}
                    canEdit={canEdit}
                    isEditingText={editingTextId === el.id}
                    onTextChange={(nextText) =>
                      handlePatchElement(el.id, { text: nextText }, false)
                    }
                    onTextResize={(nextHeight) =>
                      handlePatchElement(el.id, { height: nextHeight }, false)
                    }
                    onTextBlur={() => {
                      const current = elementsRef.current.find(
                        (i) => i.id === el.id
                      );
                      if (current) {
                        persistPatch(el.id, {
                          text: current.text ?? "",
                          height: current.height,
                        });
                      }
                      setEditingTextId(null);
                    }}
                    onVideoAutoHide={(elId) => {
                      handlePatchElement(elId, {
                        visible: false,
                        playing: false,
                      });
                    }}
                    onAudioControl={handleControlAudio}
                    onAudioWaveformDecoded={handleAudioWaveformDecoded}
                    onPointerDown={(e) => handleElementPointerDown(e, el)}
                    onDoubleClick={(e) => {
                      if (!canEdit || el.locked) return;
                      if (el.type === "text") {
                        e.stopPropagation();
                        setSelectedIds([el.id]);
                        setEditingTextId(el.id);
                      }
                    }}
                  />
                );
              })}

              {/* Active Local Draft Element */}
              {draftElement && (
                <StageElement element={draftElement} mode="editor" />
              )}

              {/* Remote Collaborator Live Draft Strokes */}
              {Object.values(remoteDrafts).map((draft) => (
                <StageElement
                  key={draft.element.id}
                  element={draft.element}
                  mode="editor"
                />
              ))}

              {/* Active Magnetic Snap Guide Lines (Editor ONLY) */}
              {activeSnapGuides.length > 0 && (
                <svg
                  width={STAGE_WIDTH}
                  height={STAGE_HEIGHT}
                  viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
                  className="pointer-events-none absolute inset-0 overflow-visible"
                  style={{ zIndex: 9995 }}
                >
                  {activeSnapGuides.map((g, idx) => (
                    <line
                      key={idx}
                      x1={g.orientation === "v" ? g.pos : g.start}
                      y1={g.orientation === "v" ? g.start : g.pos}
                      x2={g.orientation === "v" ? g.pos : g.end}
                      y2={g.orientation === "v" ? g.end : g.pos}
                      stroke={g.kind === "center" ? "#f43f5e" : "#38bdf8"}
                      strokeWidth={1.75 / camera.zoom}
                      strokeDasharray={
                        g.kind === "element"
                          ? undefined
                          : `${6 / camera.zoom} ${4 / camera.zoom}`
                      }
                    />
                  ))}
                </svg>
              )}

              {/* Marquee Drag Selection Box */}
              {marqueeBox && (
                <div
                  className="pointer-events-none absolute bg-sky-500/10 border border-sky-400"
                  style={{
                    left: marqueeBox.x,
                    top: marqueeBox.y,
                    width: marqueeBox.width,
                    height: marqueeBox.height,
                    borderWidth: 1.5 / camera.zoom,
                    zIndex: 9996,
                  }}
                />
              )}

              {/* Eraser Cursor Circle */}
              {tool === "eraser" && eraserCursorPos && (
                <div
                  className="pointer-events-none absolute rounded-full border-2 border-rose-400 bg-rose-500/15"
                  style={{
                    left: eraserCursorPos.x - drawDefaults.eraserSize / 2,
                    top: eraserCursorPos.y - drawDefaults.eraserSize / 2,
                    width: drawDefaults.eraserSize,
                    height: drawDefaults.eraserSize,
                    borderWidth: Math.max(1.5, 2 / camera.zoom),
                    zIndex: 9997,
                  }}
                />
              )}

              {/* Single Selection & Transform Controls (EDITOR ONLY — works even when ghost-hidden or editing text!) */}
              {singleSelected &&
                canEdit &&
                !singleSelected.locked && (
                  <div
                    className="pointer-events-none"
                    style={{
                      position: "absolute",
                      left: singleSelected.x,
                      top: singleSelected.y,
                      width: Math.max(12, singleSelected.width),
                      height: Math.max(12, singleSelected.height),
                      transform: singleSelected.rotation
                        ? `rotate(${singleSelected.rotation}deg)`
                        : undefined,
                      transformOrigin: "center center",
                      zIndex: 9998,
                    }}
                  >
                    <div
                      className="absolute inset-0 border-2 border-sky-400 pointer-events-none"
                      style={{ borderWidth: Math.max(1.5, 2 / camera.zoom) }}
                    />

                    {/* Draggable border strips so even hollow shapes / strokes / active text can be dragged effortlessly */}
                    {tool === "select" && !spacePressed && (
                      <>
                        {(
                          [
                            { top: -6 / camera.zoom, left: 0, right: 0, height: 12 / camera.zoom },
                            { bottom: -6 / camera.zoom, left: 0, right: 0, height: 12 / camera.zoom },
                            { left: -6 / camera.zoom, top: 0, bottom: 0, width: 12 / camera.zoom },
                            { right: -6 / camera.zoom, top: 0, bottom: 0, width: 12 / camera.zoom },
                          ] as React.CSSProperties[]
                        ).map((edgeStyle, edgeIdx) => (
                          <div
                            key={edgeIdx}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setEditingTextId(null);
                              const pt = screenToStage(e.clientX, e.clientY);
                              interactionRef.current = {
                                kind: "move",
                                pointerId: e.pointerId,
                                startClientX: e.clientX,
                                startClientY: e.clientY,
                                startStageX: pt.x,
                                startStageY: pt.y,
                                items: [
                                  {
                                    id: singleSelected.id,
                                    origX: singleSelected.x,
                                    origY: singleSelected.y,
                                  },
                                ],
                                moved: false,
                              };
                              capturePointerSafe(e.pointerId);
                            }}
                            className="pointer-events-auto absolute cursor-move"
                            style={edgeStyle}
                          />
                        ))}
                      </>
                    )}

                    {/* Rotation handle */}
                    <div
                      onPointerDown={(e) =>
                        handleRotatePointerDown(e, singleSelected)
                      }
                      title="Rotar (Shift para 15° · Alt desactiva imán)"
                      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full bg-sky-400 border-2 border-white shadow cursor-grab"
                      style={{
                        top: -34 / camera.zoom,
                        width: 14 / camera.zoom,
                        height: 14 / camera.zoom,
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
                          handleResizePointerDown(e, singleSelected, handle)
                        }
                        className="pointer-events-auto absolute rounded-sm bg-white border-2 border-sky-500 shadow"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: 12 / camera.zoom,
                          height: 12 / camera.zoom,
                          transform: "translate(-50%, -50%)",
                          cursor,
                        }}
                      />
                    ))}
                  </div>
                )}

              {/* Multi-Selection Bounding Frame (draggable group handle) */}
              {multiBounds && (
                <div
                  onPointerDown={(e) => {
                    if (tool !== "select" || spacePressed || e.button !== 0 || !canEdit)
                      return;
                    e.stopPropagation();
                    e.preventDefault();
                    const pt = screenToStage(e.clientX, e.clientY);
                    const itemsToMove = elementsRef.current
                      .filter(
                        (item) =>
                          selectedIdsRef.current.includes(item.id) &&
                          !item.locked
                      )
                      .map((item) => ({
                        id: item.id,
                        origX: item.x,
                        origY: item.y,
                      }));
                    if (itemsToMove.length === 0) return;
                    interactionRef.current = {
                      kind: "move",
                      pointerId: e.pointerId,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startStageX: pt.x,
                      startStageY: pt.y,
                      items: itemsToMove,
                      moved: false,
                    };
                    capturePointerSafe(e.pointerId);
                  }}
                  className="pointer-events-auto cursor-move absolute border-2 border-dashed border-sky-400 bg-sky-500/[0.03]"
                  style={{
                    left: multiBounds.left,
                    top: multiBounds.top,
                    width: multiBounds.width,
                    height: multiBounds.height,
                    borderWidth: Math.max(1.5, 2 / camera.zoom),
                    zIndex: 9998,
                  }}
                />
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
                    transform: `scale(${1 / camera.zoom})`,
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
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-studio-900/85 border border-white/[0.08] text-[11px] text-zinc-400 backdrop-blur">
            <span>
              <kbd className="text-zinc-200 font-mono">Espacio</kbd> + arrastrar:
              mover vista
            </span>
            <span>·</span>
            <span>
              <kbd className="text-zinc-200 font-mono">V</kbd> arrastre múltiple
            </span>
            <span>·</span>
            <span>
              <kbd className="text-zinc-200 font-mono">M</kbd> imán ·{" "}
              <kbd className="text-zinc-200 font-mono">G</kbd> guías
            </span>
            <span>·</span>
            <span>Suelta MP3, MP4, WebM, PNG, PDF o fuentes aquí</span>
          </div>
        </div>

        {/* Right Dock: Estilo (DEFAULT FIRST), Animación, Presets */}
        {showRightPanel && (
          <StyleInspectorPanel
            boardId={initialBoard.id}
            tool={tool}
            selectedElements={selectedElements}
            canEdit={canEdit}
            drawDefaults={drawDefaults}
            customFonts={customFonts}
            onDrawDefaultsChange={setDrawDefaults}
            onPatchElement={(id, patch) => handlePatchElement(id, patch, true)}
            onBatchPatch={handleBatchPatch}
            onDeleteElements={handleDeleteElements}
            onDuplicateElement={handleDuplicateElement}
            onTriggerVideo={handleTriggerVideo}
            onControlAudio={handleControlAudio}
            onInsertTextFromPanel={handleInsertTextFromPanel}
            onFontUploaded={(asset) => {
              setAssets((prev) => [
                asset,
                ...prev.filter((a) => a.id !== asset.id),
              ]);
              broadcastLibraryUpdated();
            }}
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
        myRole={myRole}
        initialMembers={members}
        onObsTokenChange={setObsToken}
        onMembersChange={setMembers}
        onMemberElementsDeleted={(ids) => {
          const delSet = new Set(ids);
          setElements((prev) => prev.filter((e) => !delSet.has(e.id)));
          setSelectedIds((prev) => prev.filter((id) => !delSet.has(id)));
        }}
        onBroadcastMemberUpdated={broadcastMemberUpdated}
        onBroadcastMemberKicked={broadcastMemberKicked}
      />

      {/* Document Attachment Modal */}
      <DocumentAttachModal
        open={docModalOpen}
        boardId={initialBoard.id}
        initialFile={pendingDocFile}
        onClose={() => {
          setDocModalOpen(false);
          setPendingDocFile(null);
        }}
        onDocumentInserted={handleDocumentInserted}
      />

      {/* Onboarding Tutorial */}
      <OnboardingTutorial open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
};
