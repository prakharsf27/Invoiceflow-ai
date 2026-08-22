export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5001/api';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('invoiceflow_token');
  } catch {
    return null;
  }
};

export const fetchApi = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorJson: any = null;
    try {
      errorJson = await response.json();
    } catch {
      // ignore
    }
    const errorMsg = errorJson?.error || errorJson?.message || `HTTP error! status: ${response.status}`;
    throw new Error(errorMsg);
  }

  const json: any = await response.json();
  return json.data !== undefined ? json.data : json;
};

export const simulateDelay = <T>(data: T, delayMs: number = 200): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
};
