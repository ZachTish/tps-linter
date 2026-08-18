export type SaveLintWorker<T> = (item: T) => void | Promise<void>;

export interface SaveLintTimerApi {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SaveLintSchedulerOptions<T> {
  delayMs?: number;
  onError?: (error: unknown, item: T) => void | Promise<void>;
  timerApi?: SaveLintTimerApi;
}

export interface ManualSaveShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

export interface SaveLintFeedbackRun {
  explicitAtStart: boolean;
}

export class SaveLintFeedbackTracker<T> {
  private readonly pendingExplicit = new Set<T>();

  requestExplicit(item: T): void {
    this.pendingExplicit.add(item);
  }

  beginRun(item: T): SaveLintFeedbackRun {
    return { explicitAtStart: this.pendingExplicit.delete(item) };
  }

  completeRun(item: T, run: SaveLintFeedbackRun): boolean {
    const explicitDuringRun = this.pendingExplicit.delete(item);
    return run.explicitAtStart || explicitDuringRun;
  }

  requeueRun(item: T, run: SaveLintFeedbackRun): void {
    if (run.explicitAtStart) this.pendingExplicit.add(item);
  }

  clear(): void {
    this.pendingExplicit.clear();
  }
}

interface ScheduledTimer {
  handle: unknown;
}

interface ItemState {
  timer: ScheduledTimer | null;
  running: boolean;
  rerunRequested: boolean;
}

const DEFAULT_DELAY_MS = 500;

const DEFAULT_TIMER_API: SaveLintTimerApi = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(
      handle as ReturnType<typeof globalThis.setTimeout>,
    );
  },
};

export function isManualSaveShortcut(
  event: ManualSaveShortcutEvent,
  useMetaKey: boolean,
): boolean {
  const primaryModifier = useMetaKey ? event.metaKey : event.ctrlKey;
  const secondaryModifier = useMetaKey ? event.ctrlKey : event.metaKey;
  return (
    event.key.toLowerCase() === "s" &&
    primaryModifier &&
    !secondaryModifier &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing
  );
}

export function isPageFocusEntry(
  targetInsideView: boolean,
  previousTargetInsideView: boolean,
): boolean {
  return targetInsideView && !previousTargetInsideView;
}

export function editorContentMatchesFile(
  editorContent: string,
  fileContent: string,
): boolean {
  if (editorContent === fileContent) {
    return true;
  }

  const editorNeedsNormalization =
    editorContentNeedsNormalization(editorContent);
  const fileNeedsNormalization =
    editorContentNeedsNormalization(fileContent);
  if (!editorNeedsNormalization && !fileNeedsNormalization) {
    return false;
  }

  return (editorNeedsNormalization
    ? normalizeEditorComparison(editorContent)
    : editorContent) === (fileNeedsNormalization
    ? normalizeEditorComparison(fileContent)
    : fileContent);
}

export function editorContentNeedsNormalization(content: string): boolean {
  return content.charCodeAt(0) === 0xfeff || content.includes("\r");
}

/**
 * Invalidates asynchronous plugin work across unload/reload boundaries.
 *
 * A captured generation remains valid only while its activation is current.
 */
export class SaveLintLifecycle {
  private active = false;
  private generation = 0;

  activate(): number {
    this.active = true;
    this.generation += 1;
    return this.generation;
  }

  capture(): number {
    return this.generation;
  }

  invalidate(): void {
    this.active = false;
    this.generation += 1;
  }

  isActive(): boolean {
    return this.active;
  }

  isCurrent(generation: number): boolean {
    return this.active && this.generation === generation;
  }
}
/**
 * Debounces work independently per item and serializes repeat work for an item.
 *
 * Requests received while a worker is running coalesce into one delayed rerun.
 * Cancelling pending work does not interrupt an in-flight worker.
 */
export class SaveLintScheduler<T> {
  private readonly worker: SaveLintWorker<T>;
  private readonly delayMs: number;
  private readonly onError:
    | ((error: unknown, item: T) => void | Promise<void>)
    | undefined;
  private readonly timerApi: SaveLintTimerApi;
  private readonly states = new Map<T, ItemState>();
  private disposed = false;

  constructor(
    worker: SaveLintWorker<T>,
    options: SaveLintSchedulerOptions<T> = {},
  ) {
    const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("Save lint delay must be a finite non-negative number.");
    }

    this.worker = worker;
    this.delayMs = delayMs;
    this.onError = options.onError;
    this.timerApi = options.timerApi ?? DEFAULT_TIMER_API;
  }

  request(item: T): void {
    if (this.disposed) {
      return;
    }

    let state = this.states.get(item);
    if (!state) {
      state = {
        timer: null,
        running: false,
        rerunRequested: false,
      };
      this.states.set(item, state);
    }

    if (state.running) {
      state.rerunRequested = true;
      return;
    }

    this.schedule(item, state);
  }

  cancelPending(): void {
    for (const [item, state] of this.states) {
      if (state.timer) {
        this.timerApi.clearTimeout(state.timer.handle);
        state.timer = null;
      }
      state.rerunRequested = false;

      if (!state.running) {
        this.states.delete(item);
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelPending();
  }

  private schedule(item: T, state: ItemState): void {
    if (state.timer) {
      this.timerApi.clearTimeout(state.timer.handle);
    }

    const scheduledTimer: ScheduledTimer = { handle: undefined };
    state.timer = scheduledTimer;
    scheduledTimer.handle = this.timerApi.setTimeout(() => {
      if (
        this.disposed ||
        this.states.get(item) !== state ||
        state.timer !== scheduledTimer
      ) {
        return;
      }

      state.timer = null;
      state.running = true;
      void this.run(item, state);
    }, this.delayMs);
  }

  private async run(item: T, state: ItemState): Promise<void> {
    try {
      await this.worker(item);
    } catch (error) {
      if (this.onError) {
        try {
          await this.onError(error, item);
        } catch {
          // Error reporting must not wedge this item's scheduler state.
        }
      }
    } finally {
      state.running = false;

      if (!this.disposed && state.rerunRequested) {
        state.rerunRequested = false;
        this.schedule(item, state);
      } else if (state.timer === null && this.states.get(item) === state) {
        this.states.delete(item);
      }
    }
  }
}

function normalizeEditorComparison(content: string): string {
  return content.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");
}
