import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listMediaForUser,
  registerCloudMediaAsset,
  saveMediaAsset,
} from "@/lib/store";

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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const assets = await listMediaForUser(user);
  return NextResponse.json({ assets });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Direct browser-to-Supabase Storage metadata registration (bypasses Vercel 4.5 MB API limit)
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        id?: string;
        name?: string;
        kind?: "video" | "image";
        mimeType?: string;
        url?: string;
        fileName?: string;
        sizeBytes?: number;
        width?: number;
        height?: number;
        durationSec?: number;
        tags?: string[];
      };

      if (!body.url || !body.fileName || !body.kind || !body.mimeType) {
        return NextResponse.json(
          { error: "Metadatos de media incompletos." },
          { status: 400 }
        );
      }

      const asset = await registerCloudMediaAsset(user, {
        id: body.id ?? "",
        name: body.name ?? "Archivo media",
        kind: body.kind === "video" ? "video" : "image",
        mimeType: body.mimeType,
        url: body.url,
        fileName: body.fileName,
        sizeBytes: Number(body.sizeBytes ?? 0),
        width: body.width,
        height: body.height,
        durationSec: body.durationSec,
        tags: body.tags ?? [],
      });

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

    const mimeType = file.type || "";
    const lowerName = file.name.toLowerCase();
    const isVideo =
      ALLOWED_VIDEO_MIMES.has(mimeType) ||
      /\.(mp4|webm|mov|ogv)$/i.test(lowerName);
    const isImage =
      ALLOWED_IMAGE_MIMES.has(mimeType) ||
      /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(lowerName);

    if (!isVideo && !isImage) {
      return NextResponse.json(
        {
          error:
            "Formato no soportado. Sube videos (MP4, WebM, MOV) o imágenes (PNG, JPG, WebP, GIF).",
        },
        { status: 400 }
      );
    }

    const resolvedMime =
      mimeType ||
      (isVideo
        ? lowerName.endsWith(".webm")
          ? "video/webm"
          : "video/mp4"
        : "image/png");

    const nameField = formData.get("name");
    const customName =
      typeof nameField === "string" && nameField.trim()
        ? nameField.trim()
        : file.name.replace(/\.[^/.]+$/, "");

    const widthVal = Number(formData.get("width") || 0) || undefined;
    const heightVal = Number(formData.get("height") || 0) || undefined;
    const durationVal = Number(formData.get("durationSec") || 0) || undefined;
    const tagsRaw = formData.get("tags");
    const tags =
      typeof tagsRaw === "string" && tagsRaw.trim()
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await saveMediaAsset(user, {
      name: customName,
      originalFileName: file.name,
      mimeType: resolvedMime,
      kind: isVideo ? "video" : "image",
      buffer,
      width: widthVal,
      height: heightVal,
      durationSec: durationVal,
      tags,
    });

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
