/**
 * Server-side AI rate limiter.
 * Controls request rates per user and per company using sliding window rate limits.
 */

interface RateBucket {
  timestamps: number[];
  dayTimestamps: number[];
}

class AIRateLimiter {
  private buckets = new Map<string, RateBucket>();

  private getMaxPerMinute(): number {
    const val = parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE || '20', 10);
    return isNaN(val) || val <= 0 ? 20 : val;
  }

  private getMaxPerDay(): number {
    const val = parseInt(process.env.AI_MAX_REQUESTS_PER_DAY || '500', 10);
    return isNaN(val) || val <= 0 ? 500 : val;
  }

  /**
   * Check whether a request is allowed for a given key (user ID or company ID).
   */
  public checkLimit(key: string): {
    allowed: boolean;
    remainingMinute: number;
    remainingDay: number;
    retryAfterSeconds?: number;
  } {
    const now = Date.now();
    const maxPerMinute = this.getMaxPerMinute();
    const maxPerDay = this.getMaxPerDay();

    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], dayTimestamps: [] };
      this.buckets.set(key, bucket);
    }

    // Prune stale timestamps
    bucket.timestamps = bucket.timestamps.filter((t) => t > oneMinuteAgo);
    bucket.dayTimestamps = bucket.dayTimestamps.filter((t) => t > oneDayAgo);

    // Check minute limit
    if (bucket.timestamps.length >= maxPerMinute) {
      const oldestInMinute = bucket.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldestInMinute + 60 * 1000 - now) / 1000);
      return {
        allowed: false,
        remainingMinute: 0,
        remainingDay: Math.max(0, maxPerDay - bucket.dayTimestamps.length),
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    // Check day limit
    if (bucket.dayTimestamps.length >= maxPerDay) {
      const oldestInDay = bucket.dayTimestamps[0];
      const retryAfterSeconds = Math.ceil((oldestInDay + 24 * 60 * 60 * 1000 - now) / 1000);
      return {
        allowed: false,
        remainingMinute: Math.max(0, maxPerMinute - bucket.timestamps.length),
        remainingDay: 0,
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    return {
      allowed: true,
      remainingMinute: maxPerMinute - bucket.timestamps.length,
      remainingDay: maxPerDay - bucket.dayTimestamps.length,
    };
  }

  /**
   * Consume a rate limit token after verifying availability.
   */
  public consume(key: string): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], dayTimestamps: [] };
      this.buckets.set(key, bucket);
    }

    bucket.timestamps.push(now);
    bucket.dayTimestamps.push(now);
  }

  /**
   * Reset limits (primarily for testing purposes).
   */
  public reset(): void {
    this.buckets.clear();
  }
}

export const aiRateLimiter = new AIRateLimiter();
