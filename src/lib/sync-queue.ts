export type QueuedBoardAction = {
  kind:
    | "upsert"
    | "upsertMany"
    | "patch"
    | "batchPatch"
    | "replace"
    | "delete"
    | "triggerVideo"
    | "controlAudio"
    | "authorVisibility"
    | "authorDelete";
  elementId?: string;
  elementIds?: string[];
  payload: Record<string, unknown>;
};

export class BoardSyncQueue {
  private queue: QueuedBoardAction[] = [];
  private flushing = false;
  private disposed = false;
  private readonly boardId: string;
  private readonly onError?: (msg: string | null) => void;
  private readonly onForceResync?: () => void;

  constructor(options: {
    boardId: string;
    onError?: (msg: string | null) => void;
    onForceResync?: () => void;
  }) {
    this.boardId = options.boardId;
    this.onError = options.onError;
    this.onForceResync = options.onForceResync;
  }

  enqueue(action: QueuedBoardAction): void {
    if (this.disposed) return;

    // Coalesce consecutive patches on the same elementId
    if (action.kind === "patch" && action.elementId) {
      const existingIdx = this.queue.findIndex(
        (item) => item.kind === "patch" && item.elementId === action.elementId
      );
      if (existingIdx >= 0) {
        const existing = this.queue[existingIdx];
        const prevPatch = (existing.payload.patch as Record<string, unknown>) ?? {};
        const nextPatch = (action.payload.patch as Record<string, unknown>) ?? {};
        this.queue[existingIdx] = {
          ...existing,
          payload: {
            ...action.payload,
            patch: { ...prevPatch, ...nextPatch },
          },
        };
        void this.pump();
        return;
      }
    }

    // If deleting elements, drop pending patches/upserts for those deleted IDs
    if (action.kind === "delete" && action.elementIds?.length) {
      const delSet = new Set(action.elementIds);
      this.queue = this.queue.filter((item) => {
        if (
          (item.kind === "patch" || item.kind === "upsert") &&
          item.elementId &&
          delSet.has(item.elementId)
        ) {
          return false;
        }
        return true;
      });
    }

    // Coalesce consecutive controlAudio calls on the same elementId
    if (action.kind === "controlAudio" && action.elementId) {
      const existingIdx = this.queue.findIndex(
        (item) => item.kind === "controlAudio" && item.elementId === action.elementId
      );
      if (existingIdx >= 0) {
        this.queue[existingIdx] = action;
        void this.pump();
        return;
      }
    }

    // If replacing the entire board, supersede older mutations except triggered videos/audios
    if (action.kind === "replace") {
      this.queue = this.queue.filter(
        (item) => item.kind === "triggerVideo" || item.kind === "controlAudio"
      );
    }

    this.queue.push(action);
    void this.pump();
  }

  hasPendingWork(): boolean {
    return this.flushing || this.queue.length > 0;
  }

  private async pump(): Promise<void> {
    if (this.flushing || this.disposed) return;
    this.flushing = true;

    try {
      while (this.queue.length > 0 && !this.disposed) {
        const next = this.queue.shift()!;
        const ok = await this.sendWithRetry(next);
        if (!ok && next.kind !== "patch") {
          // Trigger reconciliation if an authoritative write failed
          this.onForceResync?.();
        }
      }
    } finally {
      this.flushing = false;
      if (this.queue.length > 0 && !this.disposed) {
        void this.pump();
      }
    }
  }

  private async sendWithRetry(action: QueuedBoardAction): Promise<boolean> {
    const delays = [0, 350, 950];
    let lastError: string | null = null;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (this.disposed) return false;
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }

      try {
        const res = await fetch(
          `/api/boards/${encodeURIComponent(this.boardId)}/elements`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.payload),
          }
        );

        if (res.ok) {
          this.onError?.(null);
          return true;
        }

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        lastError = data.error || `Error guardando cambios (HTTP ${res.status})`;

        // Do not retry 401/403/400 client authorization or validation errors
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          this.onError?.(lastError);
          return false;
        }
      } catch {
        lastError = "Error de red guardando los cambios.";
      }
    }

    this.onError?.(lastError);
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
  }
}
