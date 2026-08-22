/**
 * Safe AI usage logging utility.
 * Records request metrics without leaking credentials, passwords, JWTs, or full API keys.
 */

export interface AILogEntry {
  requestType: 'ocr_extraction' | 'risk_analysis' | 'copilot_query' | 'test';
  companyId?: string;
  userId?: string;
  timestamp: string;
  success: boolean;
  cached: boolean;
  model: string;
  latencyMs: number;
  tokensEstimated?: number;
  error?: string;
  rateLimitRemaining?: {
    minute: number;
    day: number;
  };
}

class AILogger {
  public log(entry: AILogEntry): void {
    const sanitizedError = entry.error
      ? entry.error.replace(/(AIza[0-9A-Za-z-_]{35})/g, '[REDACTED_API_KEY]')
      : undefined;

    const logPayload = {
      ...entry,
      error: sanitizedError,
    };

    if (entry.success) {
      console.log(
        `[AI-AUDIT] ${entry.timestamp} | ${entry.requestType.toUpperCase()} | Company: ${entry.companyId || 'anon'} | Cached: ${entry.cached} | Model: ${entry.model} | Latency: ${entry.latencyMs}ms`
      );
    } else {
      console.warn(
        `[AI-AUDIT-ERROR] ${entry.timestamp} | ${entry.requestType.toUpperCase()} | Company: ${entry.companyId || 'anon'} | Error: ${sanitizedError}`
      );
    }
  }
}

export const aiLogger = new AILogger();
