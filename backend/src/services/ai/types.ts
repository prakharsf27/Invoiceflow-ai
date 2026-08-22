export interface AIProviderResult<T = string> {
  response: T;
  model: string;
  provider: 'gemini' | 'groq';
  latencyMs: number;
}

export interface AIProvider {
  name: 'gemini' | 'groq';
  isConfigured(): boolean;
  generateText(
    prompt: string,
    systemInstruction?: string,
    options?: { temperature?: number; jsonMode?: boolean }
  ): Promise<AIProviderResult<string>>;
  extractDocumentMedia(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { systemInstruction?: string; userPrompt?: string }
  ): Promise<AIProviderResult<string>>;
}

/**
 * Determines whether an AI error is due to temporary provider availability/rate-limit issues
 * (such as 429, RESOURCE_EXHAUSTED, 503, network timeouts) where fallback to Groq should occur.
 */
export function isRetryableAIError(error: any): boolean {
  if (!error) return false;

  const message = (error.message || String(error)).toLowerCase();
  const status = error.status || error.statusCode || error.response?.status;

  // 1. Explicit Status Codes
  if (status === 429 || status === 503 || status === 502 || status === 504) {
    return true;
  }

  // 2. Rate Limit & Resource Exhaustion Keyphrases
  const retryablePhrases = [
    'resource_exhausted',
    'resourceexhausted',
    'rate_limit',
    'ratelimit',
    'quota_exceeded',
    'quota exceeded',
    '429',
    '503',
    'service_unavailable',
    'service unavailable',
    'temporarily unavailable',
    'too many requests',
    'overloaded',
    'deadline_exceeded',
    'deadline exceeded',
    'etimedout',
    'econnreset',
    'fetch failed',
    'network error',
    'socket hang up',
  ];

  return retryablePhrases.some((phrase) => message.includes(phrase));
}
