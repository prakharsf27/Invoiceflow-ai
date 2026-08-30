export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5001/api';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export const sanitizeUserErrorMessage = (rawMessage?: string): string => {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'An unexpected error occurred. Please try again.';
  }

  const lower = rawMessage.toLowerCase();

  // Rate limiting / quota errors
  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('429')
  ) {
    return 'AI processing is temporarily busy. Please try again in a few moments.';
  }

  // Provider / model names leakage
  if (
    lower.includes('gemini') ||
    lower.includes('groq') ||
    lower.includes('gpt-oss') ||
    lower.includes('qwen') ||
    lower.includes('model_not_found')
  ) {
    return 'AI processing encountered a temporary issue. Please try again shortly.';
  }

  // Database / infrastructure leakage
  if (
    lower.includes('mongodb') ||
    lower.includes('mongoservererror') ||
    lower.includes('mongoose') ||
    lower.includes('econnrefused')
  ) {
    return 'Unable to access company records right now. Please try again shortly.';
  }

  return rawMessage;
};

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('invoiceflow_token');
  } catch {
    return null;
  }
};

export const fetchApi = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorJson: any = null;
      try {
        errorJson = await response.json();
      } catch {
        // ignore JSON parse error
      }

      // Handle 401 session expiration cleanly
      if (response.status === 401 && !cleanEndpoint.startsWith('/auth/login') && !cleanEndpoint.startsWith('/auth/register')) {
        try {
          localStorage.removeItem('invoiceflow_token');
          window.dispatchEvent(new CustomEvent('invoiceflow:unauthorized'));
        } catch {
          // ignore
        }
      }

      const rawMsg =
        errorJson?.error ||
        errorJson?.message ||
        (response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : response.status === 403
          ? 'Access denied. You do not have permission to perform this action.'
          : response.status === 404
          ? 'The requested resource was not found.'
          : response.status >= 500
          ? 'Server error occurred. Please try again in a few moments.'
          : `Request failed with status ${response.status}`);

      const sanitized = sanitizeUserErrorMessage(rawMsg);
      throw new Error(sanitized);
    }

    const json: any = await response.json();
    return json.data !== undefined ? json.data : json;
  } catch (err: any) {
    // Network / offline error handling
    if (err.name === 'TypeError' && err.message?.includes('fetch')) {
      throw new Error('Unable to connect to the backend server. Please verify network connectivity.');
    }
    err.message = sanitizeUserErrorMessage(err.message);
    throw err;
  }
};

export const simulateDelay = <T>(data: T, delayMs: number = 200): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
};
