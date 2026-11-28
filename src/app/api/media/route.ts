import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import {
  listBoardMediaLibrary,
  registerCloudMediaAsset,
  saveMediaAsset,
  saveRawLocalUpload,
} from "@/lib/store";
import type { MediaAsset } from "@/types/board";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024; // 80 MB

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/webm",
  "audio/opus",
]);

const ALLOWED_AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i;
const ALLOWED_FONT_EXT = /\.(ttf|otf|woff|woff2)$/i;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const { assets, folders } = await listBoardMediaLibrary(user, boardId);
  return NextResponse.json({ assets, folders });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        id?: string;
        name?: string;
        kind?: MediaAsset["kind"];
        mimeType?: string;
        url?: string;
        fileName?: string;
        sizeBytes?: number;
        width?: number;
        height?: number;
        durationSec?: number;
        tags?: string[];
        boardId?: string | null;
        folderId?: string | null;
        color?: string;
        metadata?: MediaAsset["metadata"];
      };

      if (!body.url || !body.fileName || !body.kind || !body.mimeType) {
        return NextResponse.json(
          { error: "Metadatos de media incompletos." },
          { status: 400 }
        );
      }

      const validKind: MediaAsset["kind"] =
        body.kind === "video" ||
        body.kind === "audio" ||
        body.kind === "document" ||
        body.kind === "font"
          ? body.kind
          : "image";

      const asset = await registerCloudMediaAsset(user, {
        id: body.id ?? "",
        name: body.name ?? "Archivo media",
        kind: validKind,
        mimeType: body.mimeType,
        url: body.url,
        fileName: body.fileName,
        sizeBytes: Number(body.sizeBytes ?? 0),
        width: body.width,
        height: body.height,
        durationSec: body.durationSec,
        tags: body.tags ?? [],
        boardId: body.boardId ?? null,
        folderId: body.folderId ?? null,
        color: body.color,
        metadata: body.metadata,
      });

      if (asset.boardId) {
        realtimeHub.broadcast(asset.boardId, {
          type: "library:updated",
          senderId: user.id,
          boardId: asset.boardId,
        });
      }

      return NextResponse.json({ asset }, { status: 201 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "El archivo está vacío." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 80 MB." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (formData.get("rawOnly") === "true") {
      const saved = await saveRawLocalUpload(file.name, buffer);
      return NextResponse.json({ url: saved.url, fileName: saved.fileName }, { status: 201 });
    }

    const mimeType = file.type || "";
    const lowerName = file.name.toLowerCase();
    const isVideo =
      ALLOWED_VIDEO_MIMES.has(mimeType) ||
      /\.(mp4|webm|mov|ogv)$/i.test(lowerName);
    const isImage =
      ALLOWED_IMAGE_MIMES.has(mimeType) ||
      /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(lowerName);
    const isAudio =
      ALLOWED_AUDIO_MIMES.has(mimeType) ||
      mimeType.startsWith("audio/") ||
      ALLOWED_AUDIO_EXT.test(lowerName);
    const isFont =
      ALLOWED_FONT_EXT.test(lowerName) ||
      mimeType.startsWith("font/") ||
      mimeType === "application/font-woff" ||
      mimeType === "application/x-font-ttf";

    if (!isVideo && !isImage && !isAudio && !isFont) {
      return NextResponse.json(
        {
          error:
            "Formato no soportado. Usa videos (MP4, WebM, MOV), audios (MP3, WAV, OGG, M4A), imágenes (PNG, JPG, WebP, GIF) o fuentes (TTF, OTF, WOFF, WOFF2).",
        },
        { status: 400 }
      );
    }

    const kind: MediaAsset["kind"] = isVideo
      ? "video"
      : isAudio
        ? "audio"
        : isFont
          ? "font"
          : "image";
    const resolvedMime =
      mimeType ||
      (isVideo
        ? lowerName.endsWith(".webm")
          ? "video/webm"
          : "video/mp4"
        : isAudio
          ? lowerName.endsWith(".wav")
            ? "audio/wav"
            : lowerName.endsWith(".ogg")
              ? "audio/ogg"
              : lowerName.endsWith(".m4a")
                ? "audio/mp4"
                : lowerName.endsWith(".flac")
                  ? "audio/flac"
                  : "audio/mpeg"
          : isFont
            ? lowerName.endsWith(".woff2")
              ? "font/woff2"
              : lowerName.endsWith(".woff")
                ? "font/woff"
                : lowerName.endsWith(".otf")
                  ? "font/otf"
                  : "font/ttf"
            : "image/png");

    const nameField = formData.get("name");
    const customName =
      typeof nameField === "string" && nameField.trim()
        ? nameField.trim()
        : file.name.replace(/\.[^/.]+$/, "");

    const widthVal = Number(formData.get("width") || 0) || undefined;
    const heightVal = Number(formData.get("height") || 0) || undefined;
    const durationVal = Number(formData.get("durationSec") || 0) || undefined;
    const boardIdField = formData.get("boardId");
    const boardId =
      typeof boardIdField === "string" && boardIdField.trim()
        ? boardIdField.trim()
        : null;
    const folderIdField = formData.get("folderId");
    const folderId =
      typeof folderIdField === "string" && folderIdField.trim()
        ? folderIdField.trim()
        : null;
    const colorField = formData.get("color");
    const color =
      typeof colorField === "string" && colorField.trim()
        ? colorField.trim()
        : undefined;

    let metadata: MediaAsset["metadata"];
    const metadataRaw = formData.get("metadata");
    if (typeof metadataRaw === "string" && metadataRaw.trim()) {
      try {
        metadata = JSON.parse(metadataRaw) as MediaAsset["metadata"];
      } catch {
        // ignore invalid metadata
      }
    }

    const tagsRaw = formData.get("tags");
    const tags =
      typeof tagsRaw === "string" && tagsRaw.trim()
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const asset = await saveMediaAsset(user, {
      name: customName,
      originalFileName: file.name,
      mimeType: resolvedMime,
      kind,
      buffer,
      width: widthVal,
      height: heightVal,
      durationSec: durationVal,
      tags,
      boardId,
      folderId,
      color,
      metadata,
    });

    if (asset.boardId) {
      realtimeHub.broadcast(asset.boardId, {
        type: "library:updated",
        senderId: user.id,
        boardId: asset.boardId,
      });
    }

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Error subiendo archivo media.",
      },
      { status: 500 }
    );
  }
}
