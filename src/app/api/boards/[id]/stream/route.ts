import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import { getBoardForObs, getUserBoardRole } from "@/lib/store";
import type { RealtimeEvent } from "@/types/board";

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
    const role = await getUserBoardRole(boardId, user);
    if (!role) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
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
        send: (event: RealtimeEvent) => {
          sendRaw(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

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
  const role = await getUserBoardRole(boardId, user);
  if (!role) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const event = (await req.json()) as RealtimeEvent;
    // Viewers can only broadcast their own cursor
    if (
      role === "viewer" &&
      event.type !== "cursor:move" &&
      event.type !== "cursor:leave"
    ) {
      return NextResponse.json({ error: "Solo lectura" }, { status: 403 });
    }
    realtimeHub.broadcast(boardId, event, event.senderId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  }
}
