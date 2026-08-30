export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5001/api';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

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

      const errorMsg =
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

      throw new Error(errorMsg);
    }

    const json: any = await response.json();
    return json.data !== undefined ? json.data : json;
  } catch (err: any) {
    // Network / offline error handling
    if (err.name === 'TypeError' && err.message?.includes('fetch')) {
      throw new Error('Unable to connect to the backend server. Please verify network connectivity.');
    }
    throw err;
  }
};

export const simulateDelay = <T>(data: T, delayMs: number = 200): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
};
