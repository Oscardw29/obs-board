"use client";

import type { RealtimeEvent } from "@/types/board";
import { getSupabaseBrowserClient } from "./supabase/client";

export interface RealtimeConnection {
  sendEphemeral: (event: RealtimeEvent) => void;
  sendPersistedBroadcast: (event: RealtimeEvent) => void;
  close: () => void;
}

export function connectBoardRealtime(options: {
  boardId: string;
  clientId: string;
  obsToken?: string;
  onEvent: (event: RealtimeEvent) => void;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
}): RealtimeConnection {
  const { boardId, clientId, obsToken, onEvent, onStatusChange } = options;
  const supabase = getSupabaseBrowserClient();

  // Cloud mode: Supabase Realtime Broadcast (works across serverless Vercel instances!)
  if (supabase) {
    onStatusChange?.("connecting");
    const channel = supabase.channel(`obs-board:${boardId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on("broadcast", { event: "board-event" }, ({ payload }) => {
        const evt = payload as RealtimeEvent | undefined;
        if (!evt) return;
        if (evt.senderId === clientId) return;
        if (
          obsToken &&
          (evt.type === "cursor:move" || evt.type === "cursor:leave")
        ) {
          return;
        }
        onEvent(evt);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onStatusChange?.("connected");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          onStatusChange?.("disconnected");
        }
      });

    return {
      sendEphemeral: (event: RealtimeEvent) => {
        void channel.send({
          type: "broadcast",
          event: "board-event",
          payload: event,
        });
      },
      sendPersistedBroadcast: (event: RealtimeEvent) => {
        void channel.send({
          type: "broadcast",
          event: "board-event",
          payload: event,
        });
      },
      close: () => {
        void supabase.removeChannel(channel);
      },
    };
  }

  // Local mode: Native SSE stream (syncs across browser tabs AND OBS Studio Browser Source!)
  const params = new URLSearchParams({ clientId });
  if (obsToken) params.set("token", obsToken);
  const url = `/api/boards/${encodeURIComponent(boardId)}/stream?${params.toString()}`;

  onStatusChange?.("connecting");
  const es = new EventSource(url);

  es.addEventListener("connected", () => {
    onStatusChange?.("connected");
  });

  es.onopen = () => {
    onStatusChange?.("connected");
  };

  es.onerror = () => {
    onStatusChange?.("disconnected");
  };

  es.onmessage = (msg) => {
    try {
      const evt = JSON.parse(msg.data) as RealtimeEvent;
      if (evt.senderId === clientId) return;
      onEvent(evt);
    } catch {
      // Ignore malformed heartbeat
    }
  };

  return {
    sendEphemeral: (event: RealtimeEvent) => {
      if (obsToken) return;
      void fetch(`/api/boards/${encodeURIComponent(boardId)}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {});
    },
    sendPersistedBroadcast: () => {
      // In local mode, /api/boards/[id]/elements already broadcasts via realtimeHub
    },
    close: () => {
      es.close();
    },
  };
}
