export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export type BoardRole = "owner" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  createdAt: string;
}

export interface BoardMember {
  id: string;
  boardId: string;
  email: string;
  userId?: string;
  name?: string;
  role: Exclude<BoardRole, "owner">;
  paused?: boolean;
  invitedAt: string;
}

export interface OnlineMember {
  clientId: string;
  userId: string;
  email: string;
  name: string;
  color: string;
  role: BoardRole;
  paused?: boolean;
  connectedAt: number;
}

export type ElementType =
  | "freehand"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document";

export type ToolType =
  | "select"
  | "eraser"
  | "freehand"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text";

export type BrushType =
  | "pen"
  | "marker"
  | "highlighter"
  | "calligraphy"
  | "neon"
  | "chalk"
  | "spray"
  | "dashed-ink";

export type EraserMode = "object" | "partial";

export type TextFontFamily = string;
export type StrokeStyle = "solid" | "dashed" | "dotted";

export type EntranceAnimation =
  | "none"
  | "fadeIn"
  | "popIn"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "zoomBounce"
  | "spinIn"
  | "blurIn"
  | "flipIn";

export type LoopAnimation =
  | "none"
  | "float"
  | "pulse"
  | "glowPulse"
  | "wiggle"
  | "spinSlow"
  | "bounce"
  | "shake"
  | "heartbeat"
  | "rainbowHue";

export type ExitAnimation =
  | "none"
  | "fadeOut"
  | "popOut"
  | "slideUpOut"
  | "slideDownOut"
  | "slideLeftOut"
  | "slideRightOut"
  | "blurOut";

export type AnimationEasing =
  | "ease-out"
  | "cubic-bezier(0.23, 1, 0.32, 1)"
  | "cubic-bezier(0.34, 1.56, 0.64, 1)"
  | "ease-in-out"
  | "linear";

export interface ElementAnimationConfig {
  entrance?: EntranceAnimation;
  entranceDurationMs?: number;
  entranceDelayMs?: number;
  entranceEasing?: AnimationEasing;
  loop?: LoopAnimation;
  loopDurationMs?: number;
  exit?: ExitAnimation;
  exitDurationMs?: number;
  intensity?: number; // 0.3 .. 2.0
  triggerKey?: number;
}

export interface DocumentPage {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  p?: number; // pressure 0..1
}

export interface BoardElement {
  id: string;
  boardId: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;

  // Author attribution
  createdByUserId?: string;
  createdByEmail?: string;
  createdByName?: string;

  // Drawing / shape styles
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  borderRadius?: number;

  // Brush properties
  brushType?: BrushType;
  brushSmoothing?: number;
  brushTaper?: number;

  // Freehand points relative to (x, y)
  points?: StrokePoint[];
  viewBoxWidth?: number;
  viewBoxHeight?: number;

  // Line / Arrow endpoints relative to (x, y)
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;

  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: TextFontFamily;
  customFontName?: string;
  customFontUrl?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  textBgColor?: string;
  textShadow?: boolean;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textBorderRadius?: number;

  // Image / Video properties
  src?: string;
  mediaAssetId?: string;
  aspectRatio?: number;
  objectFit?: "contain" | "cover" | "fill";

  // Document attachment properties
  documentTitle?: string;
  documentPages?: DocumentPage[];
  currentPage?: number;

  // Video & Audio playback & quick-trigger properties
  playing?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number; // 0..1
  autoHideOnEnd?: boolean;
  triggerId?: string; // bumped every time clip is re-triggered from 0:00
  triggeredAt?: number; // epoch ms when trigger fired

  // Audio-specific properties (editor-only visualizer, audio-only in OBS stream)
  durationSec?: number;
  currentTimeSec?: number;
  seekId?: string;
  waveformPeaks?: number[];
  waveformColor?: string;

  // Animation properties
  animation?: ElementAnimationConfig;

  updatedAt: number;
}

export interface StylePreset {
  id: string;
  name: string;
  builtIn?: boolean;
  category: "shape" | "brush" | "text" | "universal";
  style: Partial<BoardElement>;
}

export interface MediaFolder {
  id: string;
  boardId?: string | null;
  ownerId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  ownerId: string;
  boardId?: string | null;
  folderId?: string | null;
  name: string;
  kind: "video" | "image" | "audio" | "document" | "font";
  mimeType: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  tags: string[];
  color?: string;
  uploadedByName?: string;
  metadata?: {
    documentPages?: DocumentPage[];
    fontFamily?: string;
    waveformPeaks?: number[];
  };
  createdAt: string;
}

export interface BoardBackgroundConfig {
  imageUrl?: string | null;
  fit?: "cover" | "contain";
  opacity?: number; // 0.1..1
  showInObs?: boolean;
}

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  obsToken: string;
  stageWidth: number;
  stageHeight: number;
  background?: BoardBackgroundConfig;
  myRole: BoardRole;
  myPaused?: boolean;
  memberCount: number;
  elementCount: number;
  previewElements: BoardElement[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardDetail extends BoardSummary {
  elements: BoardElement[];
  members: BoardMember[];
}

export interface CollaboratorCursor {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

export interface LiveStrokeBroadcast {
  clientId: string;
  element: BoardElement;
}

export type RealtimeEvent =
  | {
      type: "elements:replace";
      senderId: string;
      elements: BoardElement[];
    }
  | {
      type: "element:upsert";
      senderId: string;
      element: BoardElement;
    }
  | {
      type: "elements:upsertMany";
      senderId: string;
      elements: BoardElement[];
    }
  | {
      type: "element:patch";
      senderId: string;
      elementId: string;
      patch: Partial<BoardElement>;
    }
  | {
      type: "elements:batchPatch";
      senderId: string;
      patches: Array<{ elementId: string; patch: Partial<BoardElement> }>;
    }
  | {
      type: "element:delete";
      senderId: string;
      elementIds: string[];
    }
  | {
      type: "stroke:live";
      senderId: string;
      seq?: number;
      element: BoardElement;
    }
  | {
      type: "stroke:end";
      senderId: string;
      elementId: string;
    }
  | {
      type: "video:trigger";
      senderId: string;
      elementId: string;
      triggerId: string;
      triggeredAt: number;
      playing: boolean;
      visible?: boolean;
      loop?: boolean;
      muted?: boolean;
      volume?: number;
      autoHideOnEnd?: boolean;
    }
  | {
      type: "audio:control";
      senderId: string;
      elementId: string;
      playing: boolean;
      currentTimeSec: number;
      triggeredAt: number;
      seekId: string;
      loop?: boolean;
      muted?: boolean;
      volume?: number;
    }
  | {
      type: "board:meta";
      senderId: string;
      title?: string;
      background?: BoardBackgroundConfig;
    }
  | {
      type: "cursor:move";
      senderId: string;
      cursor: CollaboratorCursor;
    }
  | {
      type: "cursor:leave";
      senderId: string;
      clientId: string;
    }
  | {
      type: "presence:sync";
      senderId: string;
      onlineMembers: OnlineMember[];
    }
  | {
      type: "member:updated";
      senderId: string;
      member: BoardMember;
    }
  | {
      type: "member:kicked";
      senderId: string;
      memberId: string;
      userId?: string;
      email: string;
      deletedElementIds?: string[];
    }
  | {
      type: "library:updated";
      senderId: string;
      boardId: string;
    };
