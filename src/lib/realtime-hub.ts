import type { OnlineMember, RealtimeEvent } from "@/types/board";

type Subscriber = {
  id: string;
  isObs: boolean;
  presence?: OnlineMember;
  send: (event: RealtimeEvent) => void;
};

const EDITOR_ONLY_EVENT_TYPES = new Set<RealtimeEvent["type"]>([
  "cursor:move",
  "cursor:leave",
  "presence:sync",
  "member:updated",
  "member:kicked",
  "library:updated",
]);

class RealtimeHub {
  private channels = new Map<string, Map<string, Subscriber>>();

  subscribe(boardId: string, subscriber: Subscriber): () => void {
    let channel = this.channels.get(boardId);
    if (!channel) {
      channel = new Map();
      this.channels.set(boardId, channel);
    }
    channel.set(subscriber.id, subscriber);

    if (!subscriber.isObs) {
      this.broadcastPresence(boardId);
    }

    return () => {
      const current = this.channels.get(boardId);
      if (!current) return;
      const hadPresence = Boolean(current.get(subscriber.id)?.presence);
      current.delete(subscriber.id);
      if (current.size === 0) {
        this.channels.delete(boardId);
      } else if (hadPresence) {
        this.broadcastPresence(boardId);
      }
    };
  }

  getOnlineMembers(boardId: string): OnlineMember[] {
    const channel = this.channels.get(boardId);
    if (!channel) return [];
    const list: OnlineMember[] = [];
    for (const sub of channel.values()) {
      if (!sub.isObs && sub.presence) {
        list.push(sub.presence);
      }
    }
    return list;
  }

  updateMemberPresence(
    boardId: string,
    target: { userId?: string; email?: string },
    patch: Partial<Pick<OnlineMember, "role" | "paused">>
  ): void {
    const channel = this.channels.get(boardId);
    if (!channel) return;
    let changed = false;
    for (const sub of channel.values()) {
      if (!sub.presence) continue;
      const matches =
        (target.userId && sub.presence.userId === target.userId) ||
        (target.email &&
          sub.presence.email.toLowerCase() === target.email.toLowerCase());
      if (matches) {
        sub.presence = { ...sub.presence, ...patch };
        changed = true;
      }
    }
    if (changed) {
      this.broadcastPresence(boardId);
    }
  }

  broadcastPresence(boardId: string): void {
    const onlineMembers = this.getOnlineMembers(boardId);
    this.broadcast(boardId, {
      type: "presence:sync",
      senderId: "system",
      onlineMembers,
    });
  }

  broadcast(boardId: string, event: RealtimeEvent, excludeSubscriberId?: string) {
    const channel = this.channels.get(boardId);
    if (!channel) return;

    for (const [id, sub] of channel.entries()) {
      if (excludeSubscriberId && id === excludeSubscriberId) continue;
      if (sub.isObs && EDITOR_ONLY_EVENT_TYPES.has(event.type)) {
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
