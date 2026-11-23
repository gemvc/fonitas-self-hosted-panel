/**
 * Identity API for public email verification (OEM customer profile).
 * In DEV, use the Vite proxy (`/fonitas-api`) so localhost does not depend on CORS.
 */
export const identityApi = (
  import.meta.env.VITE_IDENTITY_API?.trim()
  || (import.meta.env.DEV ? "/fonitas-api/api/v1" : "https://api.fonitas.com/api/v1")
);

const tenantSlug = () =>
  import.meta.env.VITE_IDENTITY_TENANT_SLUG?.trim() || "fonitas";

function identityRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(identityApi + path, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

export class IdentityApiError extends Error {
  readonly status?: number;

  constructor(code: "rate_limited" | "unavailable" | "validation", status?: number) {
    super(code);
    this.name = "IdentityApiError";
    this.status = status;
  }
}

/** Always returns 204 for accepted shape (anti-enumeration). */
export async function resendEmailVerification(email: string): Promise<void> {
  let response: Response;
  try {
    response = await identityRequest("/auth/verification/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_slug: tenantSlug(), email }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 204) return;
  if (response.status === 429) throw new IdentityApiError("rate_limited", 429);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

export async function verifyEmailByCode(email: string, code: string): Promise<boolean> {
  let response: Response;
  try {
    response = await identityRequest("/auth/verify-email/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_slug: tenantSlug(), email, code }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 200) return true;
  if (response.status === 401 || response.status === 422) return false;
  if (response.status === 429) throw new IdentityApiError("rate_limited", 429);
  throw new IdentityApiError("unavailable", response.status);
}

export const verificationCodePattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}$/;
