/**
 * Identity API for public registration and email verification (OEM customer profile).
 * In DEV, use the Vite proxy (`/fonitas-api`) so localhost does not depend on CORS.
 * OEM production builds set VITE_OEM_SAME_ORIGIN_API and talk to `/api/v1` (customer PHP bridge).
 * Buyers register in the application-owned Identity realm (not tenant `fonitas`).
 */
const viteEnv = import.meta.env ?? {};

export const identityApi = (
  String(viteEnv.VITE_IDENTITY_API ?? "").trim()
  || (viteEnv.DEV
    ? "/fonitas-api/api/v1"
    : viteEnv.VITE_OEM_SAME_ORIGIN_API === "true"
      ? "/api/v1"
      : "https://api.fonitas.com/api/v1")
);

const envTenantSlug = () =>
  String(viteEnv.VITE_IDENTITY_TENANT_SLUG ?? "").trim();

let resolvedTenantSlug: string | null = envTenantSlug() || null;
let tenantResolvePromise: Promise<string> | null = null;

function identityRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(identityApi + path, {
    ...init,
    // Cookie session for license/support after login; CSRF fetched separately when needed.
    credentials: "include",
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
  /** Seconds until the next attempt is allowed (from Retry-After / RATE_LIMITED details). */
  readonly retryAfterSeconds?: number;

  constructor(
    code:
      | "rate_limited"
      | "unavailable"
      | "validation"
      | "email_taken"
      | "register_failed"
      | "tenant_unavailable"
      | "auth_failed"
      | "mfa_required",
    status?: number,
    retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "IdentityApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function rateLimitedError(response: Response): Promise<IdentityApiError> {
  const header = Number(response.headers.get("Retry-After") ?? "");
  let fromBody = 0;
  try {
    const body = await response.json() as { error?: { details?: { retry_after?: number } } };
    fromBody = Number(body.error?.details?.retry_after ?? 0);
  } catch {
    /* ignore non-JSON */
  }
  const seconds = Math.max(1, Math.floor(Number.isFinite(header) && header > 0 ? header : fromBody || 60));
  return new IdentityApiError("rate_limited", 429, seconds);
}

export type IdentityRegisterResult = {
  display_name: string;
  email: string;
  email_verified: boolean;
  tenant_slug: string;
};

export type IdentityLoginResult = {
  display_name: string;
  email: string;
  email_verified: boolean;
  tenant_slug: string;
  mfa_required?: boolean;
  challenge_token?: string;
};

/** Resolve the application Identity tenant for this installation Origin. */
export async function resolveIdentityTenantSlug(): Promise<string> {
  if (resolvedTenantSlug) return resolvedTenantSlug;
  if (!tenantResolvePromise) {
    tenantResolvePromise = (async () => {
      const override = envTenantSlug();
      if (override) {
        resolvedTenantSlug = override;
        return override;
      }
      let response: Response;
      try {
        // Browser sends Origin for cross-origin / proxied calls; do not set Origin manually.
        response = await identityRequest("/developer-panels/oem/identity-tenant", { method: "GET" });
      } catch {
        throw new IdentityApiError("tenant_unavailable");
      }
      if (!response.ok) throw new IdentityApiError("tenant_unavailable", response.status);
      const body = await response.json() as {
        data?: { tenant_slug?: string };
      };
      const slug = body.data?.tenant_slug?.trim();
      if (!slug || slug === "fonitas") throw new IdentityApiError("tenant_unavailable", response.status);
      resolvedTenantSlug = slug;
      return slug;
    })().finally(() => {
      tenantResolvePromise = null;
    });
  }
  return tenantResolvePromise;
}

async function tenantSlug(): Promise<string> {
  return resolveIdentityTenantSlug();
}

/** Sign in against the application Identity realm; returns verification status from Symfony. */
export async function loginIdentityUser(input: {
  email: string;
  password: string;
}): Promise<IdentityLoginResult> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_slug: slug,
        email: input.email,
        password: input.password,
      }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }

  if (response.status === 200) {
    const body = await response.json() as {
      data?: {
        mfa_required?: boolean;
        challenge_token?: string;
        display_name?: string;
        primary_email?: { email?: string; is_verified?: boolean };
      };
    };
    if (body.data?.mfa_required) {
      const challenge = body.data.challenge_token?.trim() ?? "";
      if (!challenge) throw new IdentityApiError("unavailable", response.status);
      return {
        display_name: "",
        email: input.email,
        email_verified: false,
        tenant_slug: slug,
        mfa_required: true,
        challenge_token: challenge,
      };
    }
    return {
      display_name: body.data?.display_name || input.email.split("@")[0] || input.email,
      email: body.data?.primary_email?.email || input.email,
      email_verified: Boolean(body.data?.primary_email?.is_verified),
      tenant_slug: slug,
    };
  }
  if (response.status === 401) throw new IdentityApiError("auth_failed", 401);
  if (response.status === 429) throw await rateLimitedError(response);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

/** Complete MFA after password login returned `challenge_token`. */
export async function verifyMfaChallenge(input: {
  token: string;
  code: string;
}): Promise<IdentityLoginResult> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: input.token, code: input.code }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 200) {
    const body = await response.json() as {
      data?: {
        display_name?: string;
        primary_email?: { email?: string; is_verified?: boolean };
      };
    };
    return {
      display_name: body.data?.display_name || body.data?.primary_email?.email?.split("@")[0] || "Customer",
      email: body.data?.primary_email?.email || "",
      email_verified: Boolean(body.data?.primary_email?.is_verified),
      tenant_slug: slug,
    };
  }
  if (response.status === 401) throw new IdentityApiError("auth_failed", 401);
  if (response.status === 429) throw await rateLimitedError(response);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

/** Always 204 when the body shape is accepted (anti-enumeration). */
export async function forgotPassword(email: string): Promise<void> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_slug: slug, email }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 204) return;
  if (response.status === 429) throw await rateLimitedError(response);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await identityRequest("/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 204) return;
  if (response.status === 401) throw new IdentityApiError("auth_failed", 401);
  if (response.status === 429) throw await rateLimitedError(response);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

/** Creates the Fonitas Identity user in this app's realm and triggers the verification email. */
export async function registerIdentityUser(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<IdentityRegisterResult> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_slug: slug,
        display_name: input.displayName,
        email: input.email,
        password: input.password,
      }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }

  if (response.status === 201) {
    const body = await response.json() as {
      data?: {
        display_name?: string;
        primary_email?: { email?: string; is_verified?: boolean };
      };
    };
    return {
      display_name: body.data?.display_name || input.displayName,
      email: body.data?.primary_email?.email || input.email,
      email_verified: Boolean(body.data?.primary_email?.is_verified),
      tenant_slug: slug,
    };
  }
  if (response.status === 409) throw new IdentityApiError("email_taken", 409);
  if (response.status === 422) {
    const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    if (body?.error?.code === "USER_EMAIL_ALREADY_EXISTS") {
      throw new IdentityApiError("email_taken", 422);
    }
    throw new IdentityApiError("validation", 422);
  }
  if (response.status === 429) throw await rateLimitedError(response);
  throw new IdentityApiError("register_failed", response.status);
}

/** Always returns 204 for accepted shape (anti-enumeration). */
export async function resendEmailVerification(email: string): Promise<void> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/verification/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_slug: slug, email }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 204) return;
  if (response.status === 429) throw await rateLimitedError(response);
  if (response.status === 422) throw new IdentityApiError("validation", 422);
  throw new IdentityApiError("unavailable", response.status);
}

export async function verifyEmailByCode(email: string, code: string): Promise<boolean> {
  const slug = await tenantSlug();
  let response: Response;
  try {
    response = await identityRequest("/auth/verify-email/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_slug: slug, email, code }),
    });
  } catch {
    throw new IdentityApiError("unavailable");
  }
  if (response.status === 200) return true;
  if (response.status === 401 || response.status === 422) return false;
  if (response.status === 429) throw await rateLimitedError(response);
  throw new IdentityApiError("unavailable", response.status);
}

export const verificationCodePattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}$/;
