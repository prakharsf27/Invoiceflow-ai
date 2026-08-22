/**
 * Concurrency-controlled execution queue for Gemini AI requests.
 * Prevents bursting multiple simultaneous requests and exhausting API concurrency quotas.
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
  private maxConcurrency = 2; // Configurable max simultaneous calls to Gemini

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
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
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
