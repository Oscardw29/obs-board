"use client";

import { nanoid } from "nanoid";
import type { MediaAsset } from "@/types/board";
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

export async function uploadMediaFile(
  file: File
): Promise<{ asset?: MediaAsset; error?: string }> {
  const mimeType = file.type || "";
  const lowerName = file.name.toLowerCase();
  const isVideo =
    ALLOWED_VIDEO_MIMES.has(mimeType) ||
    /\.(mp4|webm|mov|ogv)$/i.test(lowerName);
  const isImage =
    ALLOWED_IMAGE_MIMES.has(mimeType) ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(lowerName);

  if (!isVideo && !isImage) {
    return {
      error:
        "Formato no soportado. Usa videos (MP4, WebM, MOV) o imágenes (PNG, JPG, WebP, GIF).",
    };
  }

  const meta = await probeMediaDimensions(file);
  const cleanName = file.name.replace(/\.[^/.]+$/, "");
  const resolvedMime =
    mimeType ||
    (isVideo
      ? lowerName.endsWith(".webm")
        ? "video/webm"
        : "video/mp4"
      : "image/png");

  const supabase = getSupabaseBrowserClient();

  // Cloud mode: Upload directly from browser -> Supabase Storage (supports up to 50 MB on free tier, bypassing Vercel's 4.5 MB API limit!)
  if (supabase) {
    const maxCloudBytes = 50 * 1024 * 1024;
    if (file.size > maxCloudBytes) {
      return {
        error:
          "El archivo supera el límite de 50 MB del plan gratuito de Supabase Storage.",
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
        kind: isVideo ? "video" : "image",
        mimeType: resolvedMime,
        url: pub.publicUrl,
        fileName: storagePath,
        sizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        durationSec: meta.durationSec,
      }),
    });

    const data = (await res.json()) as { asset?: MediaAsset; error?: string };
    if (!res.ok || !data.asset) {
      return { error: data.error || `Error registrando ${file.name}` };
    }
    return { asset: data.asset };
  }

  // Local mode: multipart upload to local server filesystem (.data/uploads)
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", cleanName);
  if (meta.width) fd.append("width", String(meta.width));
  if (meta.height) fd.append("height", String(meta.height));
  if (meta.durationSec) fd.append("durationSec", String(meta.durationSec));

  const res = await fetch("/api/media", { method: "POST", body: fd });
  const data = (await res.json()) as { asset?: MediaAsset; error?: string };
  if (!res.ok || !data.asset) {
    return { error: data.error || `Error subiendo ${file.name}` };
  }
  return { asset: data.asset };
}
