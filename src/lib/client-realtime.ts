"use client";

import type { OnlineMember, RealtimeEvent } from "@/types/board";
import { getSupabaseBrowserClient } from "./supabase/client";

export interface RealtimeConnection {
  sendEphemeral: (event: RealtimeEvent) => void;
  sendPersistedBroadcast: (event: RealtimeEvent) => void;
  updatePresence: (patch: Partial<OnlineMember>) => void;
  close: () => void;
}

const OBS_IGNORED_EVENTS = new Set<RealtimeEvent["type"]>([
  "cursor:move",
  "cursor:leave",
  "presence:sync",
  "member:updated",
  "member:kicked",
  "library:updated",
]);

export function connectBoardRealtime(options: {
  boardId: string;
  clientId: string;
  obsToken?: string;
  presenceUser?: OnlineMember;
  onEvent: (event: RealtimeEvent) => void;
  onPresenceChange?: (members: OnlineMember[]) => void;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
}): RealtimeConnection {
  const {
    boardId,
    clientId,
    obsToken,
    presenceUser,
    onEvent,
    onPresenceChange,
    onStatusChange,
  } = options;
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    onStatusChange?.("connecting");
    let currentPresence = presenceUser;

    const channel = supabase.channel(`obs-board:${boardId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: clientId },
      },
    });

    channel.on("broadcast", { event: "board-event" }, ({ payload }) => {
      const evt = payload as RealtimeEvent | undefined;
      if (!evt) return;
      if (evt.senderId === clientId) return;
      if (obsToken && OBS_IGNORED_EVENTS.has(evt.type)) {
        return;
      }
      onEvent(evt);
    });

    if (!obsToken && onPresenceChange) {
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<OnlineMember>();
        const list: OnlineMember[] = [];
        for (const entries of Object.values(state)) {
          for (const item of entries) {
            if (item && item.userId) {
              list.push(item);
            }
          }
        }
        onPresenceChange(list);
      });
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatusChange?.("connected");
        if (!obsToken && currentPresence) {
          void channel.track(currentPresence);
        }
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
      updatePresence: (patch: Partial<OnlineMember>) => {
        if (!obsToken && currentPresence) {
          currentPresence = { ...currentPresence, ...patch };
          void channel.track(currentPresence);
        }
      },
      close: () => {
        void supabase.removeChannel(channel);
      },
    };
  }

  // Local mode: Native SSE stream
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
      if (evt.type === "presence:sync") {
        onPresenceChange?.(evt.onlineMembers);
        return;
      }
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
      // In local mode, API routes already broadcast via realtimeHub
    },
    updatePresence: () => {
      // Handled server-side in local SSE hub
    },
    close: () => {
      es.close();
    },
  };
}
