/**
 * Exponential backoff and retry helper for AI API requests.
 * Handles rate limits (HTTP 429, RESOURCE_EXHAUSTED) and transient network errors gracefully.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export async function withAIRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 8000;
  const backoffFactor = options?.backoffFactor ?? 2;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const errorMessage = error?.message || String(error);
      const isRateLimit =
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit');
      const isTransient =
        isRateLimit ||
        errorMessage.includes('503') ||
        errorMessage.includes('UNAVAILABLE') ||
        errorMessage.includes('DEADLINE_EXCEEDED') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET');

      // Do not retry permanent client errors (e.g. invalid API key or invalid format)
      const isPermanent =
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.includes('INVALID_ARGUMENT');

      if (isPermanent || !isTransient || attempt > maxRetries) {
        throw error;
      }

      // Check if error contains explicit Retry-After delay
      let waitMs = delay;
      if (error?.status === 429 && error?.headers?.['retry-after']) {
        const retryAfterSec = parseInt(error.headers['retry-after'], 10);
        if (!isNaN(retryAfterSec) && retryAfterSec > 0) {
          waitMs = retryAfterSec * 1000;
        }
      }

      // Add small jitter (±15%) to avoid synchronized retry storms
      const jitter = waitMs * 0.15 * (Math.random() * 2 - 1);
      const actualWaitMs = Math.min(maxDelayMs, Math.max(200, Math.round(waitMs + jitter)));

      console.warn(
        `[AI-RETRY] Attempt ${attempt}/${maxRetries} failed (${errorMessage.slice(0, 60)}...). Retrying in ${actualWaitMs}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, actualWaitMs));
      delay = Math.min(maxDelayMs, delay * backoffFactor);
    }
  }
}
