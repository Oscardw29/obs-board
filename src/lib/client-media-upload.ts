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

export function computeWaveformPeaksFromAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleCount = 128
): number[] {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  if (channelCount === 0 || audioBuffer.length === 0) return [];
  const totalLen = audioBuffer.length;
  const blockSize = Math.max(1, Math.floor(totalLen / sampleCount));
  const raw: number[] = [];
  let maxVal = 0.001;

  for (let i = 0; i < sampleCount; i++) {
    const start = i * blockSize;
    const end = Math.min(totalLen, start + blockSize);
    const stride = Math.max(1, Math.floor((end - start) / 180));
    let sumSq = 0;
    let peak = 0;
    let count = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let j = start; j < end; j += stride) {
        const v = Math.abs(data[j] || 0);
        if (v > peak) peak = v;
        sumSq += v * v;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    // Blend peak and RMS for expressive oscilloscope look
    const combined = peak * 0.65 + rms * 0.35;
    if (combined > maxVal) maxVal = combined;
    raw.push(combined);
  }

  return raw.map((v) => Number(Math.min(1, Math.max(0.04, v / maxVal)).toFixed(3)));
}

export async function probeAudioFile(file: File): Promise<{
  durationSec?: number;
  waveformPeaks?: number[];
}> {
  let durationSec: number | undefined;
  let waveformPeaks: number[] | undefined;

  // Try Web Audio API decode for exact duration + real waveform peaks
  try {
    const AudioCtx =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (AudioCtx && file.size <= 35 * 1024 * 1024) {
      const ctx = new AudioCtx();
      try {
        const buf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
          durationSec = Number(decoded.duration.toFixed(1));
        }
        waveformPeaks = computeWaveformPeaksFromAudioBuffer(decoded, 128);
      } finally {
        void ctx.close().catch(() => {});
      }
    }
  } catch {
    // Fallback to HTMLAudioElement metadata below
  }

  if (!durationSec) {
    const objectUrl = URL.createObjectURL(file);
    try {
      durationSec = await new Promise<number | undefined>((resolve) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          resolve(
            Number.isFinite(audio.duration) && audio.duration > 0
              ? Number(audio.duration.toFixed(1))
              : undefined
          );
        };
        audio.onerror = () => resolve(undefined);
        audio.src = objectUrl;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  return { durationSec, waveformPeaks };
}

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
    return {
      error:
        "Formato no soportado. Usa videos (MP4, WebM, MOV), audios (MP3, WAV, OGG, M4A), imágenes (PNG, JPG, WebP, GIF) o fuentes (TTF, OTF, WOFF, WOFF2).",
    };
  }

  const meta =
    isVideo || isImage ? await probeMediaDimensions(file) : {};
  const audioMeta = isAudio ? await probeAudioFile(file) : {};
  const durationSec = meta.durationSec ?? audioMeta.durationSec;

  const cleanName = isFont
    ? sanitizeFontNameFromFile(file.name)
    : file.name.replace(/\.[^/.]+$/, "");
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

  const metadata: MediaAsset["metadata"] | undefined = isFont
    ? { fontFamily: cleanName }
    : isAudio && audioMeta.waveformPeaks?.length
      ? { waveformPeaks: audioMeta.waveformPeaks }
      : undefined;
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
        : isAudio
          ? ".mp3"
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
        durationSec,
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
  if (durationSec) fd.append("durationSec", String(durationSec));
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
