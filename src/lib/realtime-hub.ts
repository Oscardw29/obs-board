import type { RealtimeEvent } from "@/types/board";

type Subscriber = {
  id: string;
  isObs: boolean;
  send: (event: RealtimeEvent) => void;
};

class RealtimeHub {
  private channels = new Map<string, Map<string, Subscriber>>();

  subscribe(boardId: string, subscriber: Subscriber): () => void {
    let channel = this.channels.get(boardId);
    if (!channel) {
      channel = new Map();
      this.channels.set(boardId, channel);
    }
    channel.set(subscriber.id, subscriber);

    return () => {
      const current = this.channels.get(boardId);
      if (!current) return;
      current.delete(subscriber.id);
      if (current.size === 0) {
        this.channels.delete(boardId);
      }
    };
  }

  broadcast(boardId: string, event: RealtimeEvent, excludeSubscriberId?: string) {
    const channel = this.channels.get(boardId);
    if (!channel) return;

    for (const [id, sub] of channel.entries()) {
      if (excludeSubscriberId && id === excludeSubscriberId) continue;
      // Never leak editor cursors to OBS subscribers
      if (
        sub.isObs &&
        (event.type === "cursor:move" || event.type === "cursor:leave")
      ) {
        continue;
      }
      try {
        sub.send(event);
      } catch {
        // Broken stream will clean up on abort
      }
    }
  }

  getSubscriberCount(boardId: string): number {
    return this.channels.get(boardId)?.size ?? 0;
  }
}

const globalForHub = globalThis as unknown as {
  __obsBoardRealtimeHub?: RealtimeHub;
};

export const realtimeHub =
  globalForHub.__obsBoardRealtimeHub ??
  (globalForHub.__obsBoardRealtimeHub = new RealtimeHub());
