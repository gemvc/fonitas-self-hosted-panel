/**
 * Session customer API (License / Payment / Support / catalog helpers).
 * Uses credentials + CSRF like Identity cookie mutations.
 *
 * DEV: Vite `/fonitas-api` proxy.
 * OEM production (Phase 6): same-origin `/api/v1` via customer PHP bridge.
 * Otherwise: direct Fonitas API (CORS + credentials).
 */
const viteEnv = import.meta.env ?? {};

export const customerApiBase = (
  String(viteEnv.VITE_CUSTOMER_API ?? "").trim()
  || String(viteEnv.VITE_IDENTITY_API ?? "").trim()
  || (viteEnv.DEV
    ? "/fonitas-api/api/v1"
    : viteEnv.VITE_OEM_SAME_ORIGIN_API === "true"
      ? "/api/v1"
      : "https://api.fonitas.com/api/v1")
);

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

export class CustomerApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "CustomerApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<CustomerApiError> {
  let code: string | undefined;
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    code = body.error?.code;
    if (body.error?.message) {
      return new CustomerApiError(body.error.message, response.status, code);
    }
  } catch {
    /* ignore */
  }
  return new CustomerApiError("request_failed", response.status, code);
}

export async function ensureCustomerCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = (async () => {
      const response = await fetch(`${customerApiBase}/auth/csrf`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw await parseError(response);
      const body = await response.json() as { data?: { csrf_token?: string } };
      const token = body.data?.csrf_token?.trim();
      if (!token) throw new CustomerApiError("csrf_unavailable", response.status);
      csrfToken = token;
      return token;
    })().finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

/** Clear cached CSRF (e.g. after logout). */
export function clearCustomerCsrf(): void {
  csrfToken = null;
}

type CustomerRequestInit = RequestInit & { csrf?: boolean };

export async function customerRequest(path: string, init: CustomerRequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const needsCsrf = init.csrf === false
    ? false
    : init.csrf === true || !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (needsCsrf) {
    headers["X-CSRF-Token"] = await ensureCustomerCsrf();
  }
  if (init.body != null && !headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  try {
    return await fetch(`${customerApiBase}${path}`, {
      ...init,
      method,
      credentials: "include",
      cache: "no-store",
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CustomerApiError("unavailable");
  }
}

export async function customerJson<T>(path: string, init?: CustomerRequestInit): Promise<T> {
  const response = await customerRequest(path, init);
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await parseError(response);
  return await response.json() as T;
}
