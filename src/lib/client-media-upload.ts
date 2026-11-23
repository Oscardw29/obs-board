"use client";

import { nanoid } from "nanoid";
import type { DocumentPage, MediaAsset } from "@/types/board";
import { sanitizeFontNameFromFile } from "./fonts";
import { getSupabaseBrowserClient } from "./supabase/client";

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

const ALLOWED_FONT_EXT = /\.(ttf|otf|woff|woff2)$/i;

export async function probeMediaDimensions(file: File): Promise<{
  width?: number;
  height?: number;
  durationSec?: number;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (
      file.type.startsWith("video/") ||
      /\.(mp4|webm|mov|ogv)$/i.test(file.name)
    ) {
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            durationSec: Number.isFinite(video.duration)
              ? Number(video.duration.toFixed(1))
              : undefined,
          });
        };
        video.onerror = () => resolve({});
        video.src = objectUrl;
      });
    }
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined,
        });
      };
      img.onerror = () => resolve({});
      img.src = objectUrl;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export interface UploadMediaOptions {
  boardId?: string | null;
  folderId?: string | null;
  color?: string;
}

export async function uploadMediaFile(
  file: File,
  options: UploadMediaOptions = {}
): Promise<{ asset?: MediaAsset; error?: string }> {
  const mimeType = file.type || "";
  const lowerName = file.name.toLowerCase();
  const isVideo =
    ALLOWED_VIDEO_MIMES.has(mimeType) ||
    /\.(mp4|webm|mov|ogv)$/i.test(lowerName);
  const isImage =
    ALLOWED_IMAGE_MIMES.has(mimeType) ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(lowerName);
  const isFont =
    ALLOWED_FONT_EXT.test(lowerName) ||
    mimeType.startsWith("font/") ||
    mimeType === "application/font-woff" ||
    mimeType === "application/x-font-ttf";

  if (!isVideo && !isImage && !isFont) {
    return {
      error:
        "Formato no soportado. Usa videos (MP4, WebM, MOV), imágenes (PNG, JPG, WebP, GIF) o fuentes (TTF, OTF, WOFF, WOFF2).",
    };
  }

  const meta = isVideo || isImage ? await probeMediaDimensions(file) : {};
  const cleanName = isFont
    ? sanitizeFontNameFromFile(file.name)
    : file.name.replace(/\.[^/.]+$/, "");
  const kind: MediaAsset["kind"] = isVideo
    ? "video"
    : isFont
      ? "font"
      : "image";
  const resolvedMime =
    mimeType ||
    (isVideo
      ? lowerName.endsWith(".webm")
        ? "video/webm"
        : "video/mp4"
      : isFont
        ? lowerName.endsWith(".woff2")
          ? "font/woff2"
          : lowerName.endsWith(".woff")
            ? "font/woff"
            : lowerName.endsWith(".otf")
              ? "font/otf"
              : "font/ttf"
        : "image/png");

  const metadata = isFont ? { fontFamily: cleanName } : undefined;
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const maxCloudBytes = 50 * 1024 * 1024;
    if (file.size > maxCloudBytes) {
      return {
        error:
          "El archivo supera el límite de 50 MB de almacenamiento en la nube.",
      };
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return { error: "Tu sesión expiró. Inicia sesión de nuevo." };
    }

    const id = `med_${nanoid(12)}`;
    const extMatch = /\.([a-z0-9]{1,8})$/i.exec(file.name);
    const safeExt = extMatch
      ? `.${extMatch[1].toLowerCase()}`
      : isVideo
        ? ".mp4"
        : isFont
          ? ".ttf"
          : ".png";
    const storagePath = `${user.id}/${id}${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from("obs-media")
      .upload(storagePath, file, {
        contentType: resolvedMime,
        upsert: true,
      });

    if (uploadErr) {
      return { error: `Error subiendo a Supabase Storage: ${uploadErr.message}` };
    }

    const { data: pub } = supabase.storage
      .from("obs-media")
      .getPublicUrl(storagePath);

    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: cleanName,
        kind,
        mimeType: resolvedMime,
        url: pub.publicUrl,
        fileName: storagePath,
        sizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        durationSec: meta.durationSec,
        boardId: options.boardId ?? null,
        folderId: options.folderId ?? null,
        color: options.color,
        metadata,
      }),
    });

    const data = (await res.json()) as { asset?: MediaAsset; error?: string };
    if (!res.ok || !data.asset) {
      return { error: data.error || `Error registrando ${file.name}` };
    }
    return { asset: data.asset };
  }

  // Local mode: multipart upload
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", cleanName);
  fd.append("kind", kind);
  if (meta.width) fd.append("width", String(meta.width));
  if (meta.height) fd.append("height", String(meta.height));
  if (meta.durationSec) fd.append("durationSec", String(meta.durationSec));
  if (options.boardId) fd.append("boardId", options.boardId);
  if (options.folderId) fd.append("folderId", options.folderId);
  if (options.color) fd.append("color", options.color);
  if (metadata) fd.append("metadata", JSON.stringify(metadata));

  const res = await fetch("/api/media", { method: "POST", body: fd });
  const data = (await res.json()) as { asset?: MediaAsset; error?: string };
  if (!res.ok || !data.asset) {
    return { error: data.error || `Error subiendo ${file.name}` };
  }
  return { asset: data.asset };
}

export async function uploadRenderedPageBlob(
  blob: Blob,
  fileName: string,
  options: { width: number; height: number }
): Promise<{ url?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return { error: "Tu sesión expiró. Inicia sesión de nuevo." };
    }
    const id = `docpg_${nanoid(12)}`;
    const storagePath = `${user.id}/${id}.png`;
    const { error: uploadErr } = await supabase.storage
      .from("obs-media")
      .upload(storagePath, blob, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadErr) {
      return { error: `Error subiendo página: ${uploadErr.message}` };
    }
    const { data: pub } = supabase.storage
      .from("obs-media")
      .getPublicUrl(storagePath);
    return { url: pub.publicUrl };
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const fd = new FormData();
  fd.append("file", file);
  fd.append("rawOnly", "true");
  fd.append("width", String(options.width));
  fd.append("height", String(options.height));

  const res = await fetch("/api/media", { method: "POST", body: fd });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    return { error: data.error || "Error subiendo página del documento." };
  }
  return { url: data.url };
}

export async function registerDocumentAsset(input: {
  title: string;
  pages: DocumentPage[];
  boardId?: string | null;
  folderId?: string | null;
}): Promise<{ asset?: MediaAsset; error?: string }> {
  const firstPage = input.pages[0];
  if (!firstPage) {
    return { error: "Selecciona al menos una página del documento." };
  }

  const res = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `doc_${nanoid(12)}`,
      name: input.title,
      kind: "document",
      mimeType: "application/pdf",
      url: firstPage.url,
      fileName: `${input.title}.pdf`,
      sizeBytes: input.pages.length * 1024,
      width: firstPage.width,
      height: firstPage.height,
      boardId: input.boardId ?? null,
      folderId: input.folderId ?? null,
      metadata: {
        documentPages: input.pages,
      },
    }),
  });

  const data = (await res.json()) as { asset?: MediaAsset; error?: string };
  if (!res.ok || !data.asset) {
    return { error: data.error || "No se pudo guardar el documento en biblioteca." };
  }
  return { asset: data.asset };
}
