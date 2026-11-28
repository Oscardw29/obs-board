import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import {
  batchPatchElements,
  deleteElements,
  deleteElementsByAuthor,
  patchElement,
  replaceElements,
  setElementsVisibilityByAuthor,
  upsertElement,
  upsertManyElements,
} from "@/lib/store";
import type { BoardElement } from "@/types/board";

type ElementMutationBody =
  | { action: "upsert"; senderId: string; element: BoardElement }
  | { action: "upsertMany"; senderId: string; elements: BoardElement[] }
  | {
      action: "patch";
      senderId: string;
      elementId: string;
      patch: Partial<BoardElement>;
    }
  | {
      action: "batchPatch";
      senderId: string;
      patches: Array<{ elementId: string; patch: Partial<BoardElement> }>;
    }
  | { action: "replace"; senderId: string; elements: BoardElement[] }
  | { action: "delete"; senderId: string; elementIds: string[] }
  | {
      action: "triggerVideo";
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
      action: "controlAudio";
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
      action: "authorVisibility";
      senderId: string;
      userId?: string;
      email?: string;
      visible: boolean;
    }
  | {
      action: "authorDelete";
      senderId: string;
      userId?: string;
      email?: string;
    };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: boardId } = await ctx.params;

  let body: ElementMutationBody;
  try {
    body = (await req.json()) as ElementMutationBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const senderId = body.senderId || user.id;

  if (body.action === "upsert") {
    const res = await upsertElement(boardId, user, body.element);
    if (!res.ok || !res.element) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      { type: "element:upsert", senderId, element: res.element },
      senderId
    );
    return NextResponse.json({ ok: true, element: res.element });
  }

  if (body.action === "upsertMany") {
    const res = await upsertManyElements(boardId, user, body.elements);
    if (!res.ok || !res.elements) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      { type: "elements:upsertMany", senderId, elements: res.elements },
      senderId
    );
    return NextResponse.json({ ok: true, elements: res.elements });
  }

  if (body.action === "patch") {
    const res = await patchElement(boardId, user, body.elementId, body.patch);
    if (!res.ok || !res.element) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      {
        type: "element:patch",
        senderId,
        elementId: body.elementId,
        patch: body.patch,
      },
      senderId
    );
    return NextResponse.json({ ok: true, element: res.element });
  }

  if (body.action === "batchPatch") {
    const res = await batchPatchElements(boardId, user, body.patches);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      {
        type: "elements:batchPatch",
        senderId,
        patches: body.patches,
      },
      senderId
    );
    return NextResponse.json({ ok: true, elements: res.elements });
  }

  if (body.action === "replace") {
    const res = await replaceElements(boardId, user, body.elements);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      { type: "elements:replace", senderId, elements: body.elements },
      senderId
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const res = await deleteElements(boardId, user, body.elementIds);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      { type: "element:delete", senderId, elementIds: body.elementIds },
      senderId
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === "triggerVideo") {
    const patch: Partial<BoardElement> = {
      triggerId: body.triggerId,
      triggeredAt: body.triggeredAt,
      playing: body.playing,
    };
    if (body.visible !== undefined) patch.visible = body.visible;
    if (body.loop !== undefined) patch.loop = body.loop;
    if (body.muted !== undefined) patch.muted = body.muted;
    if (body.volume !== undefined) patch.volume = body.volume;
    if (body.autoHideOnEnd !== undefined)
      patch.autoHideOnEnd = body.autoHideOnEnd;

    const res = await patchElement(boardId, user, body.elementId, patch);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      {
        type: "video:trigger",
        senderId,
        elementId: body.elementId,
        triggerId: body.triggerId,
        triggeredAt: body.triggeredAt,
        playing: body.playing,
        visible: body.visible,
        loop: body.loop,
        muted: body.muted,
        volume: body.volume,
        autoHideOnEnd: body.autoHideOnEnd,
      },
      senderId
    );
    return NextResponse.json({ ok: true, element: res.element });
  }

  if (body.action === "controlAudio") {
    const patch: Partial<BoardElement> = {
      playing: body.playing,
      currentTimeSec: body.currentTimeSec,
      triggeredAt: body.triggeredAt,
      seekId: body.seekId,
    };
    if (body.loop !== undefined) patch.loop = body.loop;
    if (body.muted !== undefined) patch.muted = body.muted;
    if (body.volume !== undefined) patch.volume = body.volume;

    const res = await patchElement(boardId, user, body.elementId, patch);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    realtimeHub.broadcast(
      boardId,
      {
        type: "audio:control",
        senderId,
        elementId: body.elementId,
        playing: body.playing,
        currentTimeSec: body.currentTimeSec,
        triggeredAt: body.triggeredAt,
        seekId: body.seekId,
        loop: body.loop,
        muted: body.muted,
        volume: body.volume,
      },
      senderId
    );
    return NextResponse.json({ ok: true, element: res.element });
  }

  if (body.action === "authorVisibility") {
    const res = await setElementsVisibilityByAuthor(
      boardId,
      user,
      { userId: body.userId, email: body.email },
      body.visible
    );
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    if (res.patches && res.patches.length > 0) {
      realtimeHub.broadcast(
        boardId,
        { type: "elements:batchPatch", senderId, patches: res.patches },
        senderId
      );
    }
    return NextResponse.json({ ok: true, patches: res.patches ?? [] });
  }

  if (body.action === "authorDelete") {
    const res = await deleteElementsByAuthor(boardId, user, {
      userId: body.userId,
      email: body.email,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    if (res.deletedIds && res.deletedIds.length > 0) {
      realtimeHub.broadcast(
        boardId,
        { type: "element:delete", senderId, elementIds: res.deletedIds },
        senderId
      );
    }
    return NextResponse.json({ ok: true, deletedIds: res.deletedIds ?? [] });
  }

  return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
}
