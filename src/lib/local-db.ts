import crypto from "crypto";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardBackgroundConfig,
  type BoardElement,
  type BoardMember,
  type MediaAsset,
  type MediaFolder,
  type User,
} from "@/types/board";
import { pickAvatarColor } from "./geometry";

export interface LocalUserRecord extends User {
  passwordHash: string;
  passwordSalt: string;
}

export interface LocalBoardRecord {
  id: string;
  title: string;
  ownerId: string;
  obsToken: string;
  stageWidth: number;
  stageHeight: number;
  background?: BoardBackgroundConfig;
  createdAt: string;
  updatedAt: string;
}

export interface LocalDatabase {
  users: LocalUserRecord[];
  boards: LocalBoardRecord[];
  members: BoardMember[];
  elements: BoardElement[];
  folders: MediaFolder[];
  media: MediaAsset[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export function getUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

export function hashPassword(password: string, salt?: string): {
  hash: string;
  salt: string;
} {
  const actualSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, actualSalt, 64)
    .toString("hex");
  return { hash, salt: actualSalt };
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSeedDatabase(): LocalDatabase {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const demoId = "user_demo_streamer";
  const { hash, salt } = hashPassword("demo1234");

  const boardId = "board_demo_live";
  const obsToken = nanoid(24);

  const demoUser: LocalUserRecord = {
    id: demoId,
    email: "demo@oboards.local",
    name: "Streamer Demo",
    avatarColor: pickAvatarColor("demo@oboards.local"),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
  };

  const starterBoard: LocalBoardRecord = {
    id: boardId,
    title: "Overlay Principal 1080p",
    ownerId: demoId,
    obsToken,
    stageWidth: STAGE_WIDTH,
    stageHeight: STAGE_HEIGHT,
    createdAt: now,
    updatedAt: now,
  };

  const starterElements: BoardElement[] = [
    {
      id: "el_demo_badge_bg",
      boardId,
      type: "rectangle",
      name: "Etiqueta En Vivo",
      x: 72,
      y: 64,
      width: 390,
      height: 82,
      rotation: 0,
      zIndex: 1,
      visible: true,
      locked: false,
      opacity: 0.94,
      strokeColor: "#38bdf8",
      fillColor: "#10131c",
      strokeWidth: 4,
      strokeStyle: "solid",
      borderRadius: 18,
      createdByUserId: demoId,
      createdByEmail: demoUser.email,
      createdByName: demoUser.name,
      updatedAt: nowMs,
    },
    {
      id: "el_demo_badge_text",
      boardId,
      type: "text",
      name: "Título Overlay",
      x: 96,
      y: 80,
      width: 350,
      height: 54,
      rotation: 0,
      zIndex: 2,
      visible: true,
      locked: false,
      opacity: 1,
      text: "OBoardS • En Vivo",
      fontSize: 34,
      fontFamily: "Space Grotesk",
      fontWeight: "bold",
      textAlign: "left",
      textColor: "#ffffff",
      textBgColor: "transparent",
      textShadow: true,
      createdByUserId: demoId,
      createdByEmail: demoUser.email,
      createdByName: demoUser.name,
      updatedAt: nowMs,
    },
    {
      id: "el_demo_arrow",
      boardId,
      type: "arrow",
      name: "Flecha destacada",
      x: 490,
      y: 112,
      width: 210,
      height: 90,
      x2: 200,
      y2: 75,
      rotation: 0,
      zIndex: 3,
      visible: true,
      locked: false,
      opacity: 1,
      strokeColor: "#38bdf8",
      strokeWidth: 6,
      strokeStyle: "solid",
      createdByUserId: demoId,
      createdByEmail: demoUser.email,
      createdByName: demoUser.name,
      updatedAt: nowMs,
    },
    {
      id: "el_demo_note",
      boardId,
      type: "text",
      name: "Nota rápida",
      x: 710,
      y: 170,
      width: 540,
      height: 118,
      rotation: -2,
      zIndex: 4,
      visible: true,
      locked: false,
      opacity: 1,
      text: "¡Dibuja aquí o dispara clips\ndesde tu Biblioteca Compartida!",
      fontSize: 36,
      fontFamily: "Caveat",
      fontWeight: "bold",
      textAlign: "left",
      textColor: "#fde047",
      textBgColor: "rgba(16, 19, 28, 0.8)",
      textShadow: true,
      createdByUserId: demoId,
      createdByEmail: demoUser.email,
      createdByName: demoUser.name,
      updatedAt: nowMs,
    },
  ];

  return {
    users: [demoUser],
    boards: [starterBoard],
    members: [],
    elements: starterElements,
    folders: [],
    media: [],
  };
}

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  getUploadsDir();
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    writeLocalDb(seed);
  }
}

export function readLocalDb(): LocalDatabase {
  ensureStorage();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    return {
      users: parsed.users ?? [],
      boards: parsed.boards ?? [],
      members: parsed.members ?? [],
      elements: parsed.elements ?? [],
      folders: parsed.folders ?? [],
      media: parsed.media ?? [],
    };
  } catch {
    const seed = createSeedDatabase();
    writeLocalDb(seed);
    return seed;
  }
}

export function writeLocalDb(db: LocalDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmpPath, DB_FILE);
}

export function mutateLocalDb<T>(fn: (db: LocalDatabase) => T): T {
  const db = readLocalDb();
  const result = fn(db);
  writeLocalDb(db);
  return result;
}
