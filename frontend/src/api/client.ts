/**
 * Thin typed fetch wrapper.
 *
 * Only relative URLs are used in the browser (`/api/...`). In local development the
 * Vite dev server proxies those to the FastAPI backend; in production the frontend
 * and API are served under the same origin or VITE_API_BASE_URL is set. This keeps
 * the app working behind preview proxies without hardcoding a host in client code.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const API_PREFIX = `${API_BASE}/api/v1`;

const ACCESS_TOKEN_KEY = 'darukaa.accessToken';
const REFRESH_TOKEN_KEY = 'darukaa.refreshToken';

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = tokenStore.access;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network failure (backend down, offline) - surface something actionable.
    // The original error carries no information a user can act on, so it is not
    // bound; the underlying cause is visible in the browser console/network tab.
    throw new ApiRequestError(0, 'Cannot reach the API. Is the backend running?');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, detail);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  public: {
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'POST', body, auth: false }),
  },
};

export { API_PREFIX };
