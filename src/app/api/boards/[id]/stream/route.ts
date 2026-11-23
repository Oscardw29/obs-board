import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import { getBoardForObs, getUserBoardAccess } from "@/lib/store";
import type { OnlineMember, RealtimeEvent } from "@/types/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: boardId } = await ctx.params;
  const url = new URL(req.url);
  const obsToken = url.searchParams.get("token");
  const clientId = url.searchParams.get("clientId") || `sub_${nanoid(10)}`;

  let isObs = false;
  let presence: OnlineMember | undefined;

  if (obsToken) {
    const obsBoard = await getBoardForObs(boardId, obsToken);
    if (!obsBoard) {
      return NextResponse.json({ error: "Token OBS inválido" }, { status: 403 });
    }
    isObs = true;
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const access = await getUserBoardAccess(boardId, user);
    if (!access) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    presence = {
      clientId,
      userId: user.id,
      email: user.email,
      name: user.name,
      color: user.avatarColor,
      role: access.role,
      paused: access.paused,
      connectedAt: Date.now(),
    };
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendRaw = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream closed
        }
      };

      sendRaw(`event: connected\ndata: ${JSON.stringify({ clientId, isObs })}\n\n`);

      const unsubscribe = realtimeHub.subscribe(boardId, {
        id: clientId,
        isObs,
        presence,
        send: (event: RealtimeEvent) => {
          sendRaw(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      if (!isObs) {
        sendRaw(
          `data: ${JSON.stringify({
            type: "presence:sync",
            senderId: "system",
            onlineMembers: realtimeHub.getOnlineMembers(boardId),
          })}\n\n`
        );
      }

      const heartbeat = setInterval(() => {
        sendRaw(`: keepalive ${Date.now()}\n\n`);
      }, 20000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: boardId } = await ctx.params;
  const access = await getUserBoardAccess(boardId, user);
  if (!access) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const event = (await req.json()) as RealtimeEvent;
    const isReadOnlyOrPaused = access.role === "viewer" || access.paused;
    if (
      isReadOnlyOrPaused &&
      event.type !== "cursor:move" &&
      event.type !== "cursor:leave"
    ) {
      return NextResponse.json(
        { error: access.paused ? "Edición pausada" : "Solo lectura" },
        { status: 403 }
      );
    }
    realtimeHub.broadcast(boardId, event, event.senderId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  }
}
