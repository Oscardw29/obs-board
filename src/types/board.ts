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
  invitedAt: string;
}

export type ElementType =
  | "freehand"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "image"
  | "video";

export type ToolType =
  | "select"
  | "hand"
  | "freehand"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text";

export type TextFontFamily = "hand" | "sans" | "mono";
export type StrokeStyle = "solid" | "dashed" | "dotted";

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

  // Drawing / shape styles
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  borderRadius?: number;

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
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  textBgColor?: string;
  textShadow?: boolean;

  // Image / Video properties
  src?: string;
  mediaAssetId?: string;
  aspectRatio?: number;
  objectFit?: "contain" | "cover" | "fill";

  // Video playback & quick-trigger properties
  playing?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number; // 0..1
  autoHideOnEnd?: boolean;
  triggerId?: string; // bumped every time clip is re-triggered from 0:00
  triggeredAt?: number; // epoch ms when trigger fired

  updatedAt: number;
}

export interface MediaAsset {
  id: string;
  ownerId: string;
  name: string;
  kind: "video" | "image";
  mimeType: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  tags: string[];
  createdAt: string;
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
  myRole: BoardRole;
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
      type: "element:patch";
      senderId: string;
      elementId: string;
      patch: Partial<BoardElement>;
    }
  | {
      type: "element:delete";
      senderId: string;
      elementIds: string[];
    }
  | {
      type: "stroke:live";
      senderId: string;
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
      type: "board:meta";
      senderId: string;
      title: string;
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
    };
