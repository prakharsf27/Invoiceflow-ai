/**
 * Exponential backoff and retry helper for AI API requests.
 * Handles rate limits (HTTP 429, RESOURCE_EXHAUSTED) and transient network errors gracefully.
 *
 * Key behaviors:
 * - Respects the provider's Retry-After header or error message delay hint
 * - Does NOT retry permanent errors (bad API key, invalid argument)
 * - Caps maximum wait at 30 seconds per attempt to avoid indefinite stalls
 */

import { isRetryableAIError } from './types.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Extract the retry delay in ms from an error object.
 * Gemini and Groq both encode retry-after hints in slightly different ways.
 */
function extractRetryAfterMs(error: any): number | null {
  // 1. HTTP header: Retry-After (seconds)
  const retryAfterHeader =
    error?.headers?.['retry-after'] ||
    error?.response?.headers?.['retry-after'] ||
    error?.retryAfter;
  if (retryAfterHeader) {
    const sec = parseInt(String(retryAfterHeader), 10);
    if (!isNaN(sec) && sec > 0) return sec * 1000;
  }

  // 2. Error message: "retry in N second(s)" or "please retry in N seconds"
  const msg = String(error?.message || error || '').toLowerCase();
  const match = msg.match(/retry[^\d]*in[^\d]*(\d+)\s*s/);
  if (match) {
    const sec = parseInt(match[1], 10);
    if (!isNaN(sec) && sec > 0) return sec * 1000;
  }

  return null;
}

export async function withAIRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 2000;
  const maxDelayMs = options?.maxDelayMs ?? 30000; // respect provider's hint up to 30s
  const backoffFactor = options?.backoffFactor ?? 2;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;

      // Never retry permanent errors (bad API key, malformed request)
      if (!isRetryableAIError(error)) {
        throw error;
      }

      if (attempt > maxRetries) {
        throw error;
      }

      // Prefer the provider's own retry-after hint if available
      const providerHintMs = extractRetryAfterMs(error);
      const baseWaitMs = providerHintMs !== null
        ? Math.min(providerHintMs, maxDelayMs)
        : Math.min(delay, maxDelayMs);

      // Add small jitter (±10%) to avoid synchronized retry storms
      const jitter = baseWaitMs * 0.10 * (Math.random() * 2 - 1);
      const actualWaitMs = Math.max(500, Math.round(baseWaitMs + jitter));

      const errorMessage = (error?.message || String(error)).slice(0, 80);
      console.warn(
        `[AI-RETRY] Attempt ${attempt}/${maxRetries} failed: "${errorMessage}". ` +
        `Waiting ${(actualWaitMs / 1000).toFixed(1)}s before retry${providerHintMs ? ' (provider hint)' : ''}...`
      );

      await new Promise((resolve) => setTimeout(resolve, actualWaitMs));
      delay = Math.min(maxDelayMs, delay * backoffFactor);
    }
  }
}
