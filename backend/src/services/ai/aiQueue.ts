/**
 * Concurrency-controlled execution queue for AI requests.
 *
 * Purpose: prevents burst-firing multiple simultaneous requests to Gemini/Groq
 * which would exhaust per-minute RPM quotas when multiple documents are uploaded together.
 *
 * Configuration:
 *  - maxConcurrency=1: process one document at a time (safest for RPM limits)
 *  - interRequestDelayMs: minimum wait between consecutive completions
 */

type Task<T> = () => Promise<T>;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

class AIQueue {
  private queue: QueueItem<any>[] = [];
  private activeCount = 0;
  private lastCompletedAt = 0;

  // Process ONE document at a time to avoid concurrent Gemini RPM exhaustion.
  // With multiple simultaneous uploads, documents are serialized through this queue.
  private readonly maxConcurrency = 1;

  // Minimum ms gap between consecutive AI calls to stay within RPM limits.
  // At 15 RPM (Gemini free tier), you have ~4s per request budget.
  private readonly interRequestDelayMs = parseInt(
    process.env.AI_INTER_REQUEST_DELAY_MS || '2000',
    10
  );

  public async enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      // Enforce minimum gap between consecutive completions to avoid RPM bursts
      const now = Date.now();
      const timeSinceLast = now - this.lastCompletedAt;
      if (this.lastCompletedAt > 0 && timeSinceLast < this.interRequestDelayMs) {
        const waitMs = this.interRequestDelayMs - timeSinceLast;
        console.log(`[AIQueue] Throttling: waiting ${waitMs}ms before next AI request (RPM guard)...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.lastCompletedAt = Date.now();
      this.activeCount--;
      this.processNext();
    }
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}

export const aiQueue = new AIQueue();
