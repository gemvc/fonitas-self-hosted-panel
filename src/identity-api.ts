/** Identity API for public email verification (OEM customer profile). */
export const identityApi = "https://api.fonitas.com/api/v1";

const tenantSlug = () =>
  (import.meta.env.VITE_IDENTITY_TENANT_SLUG as string | undefined)?.trim() || "fonitas";

function identityRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(identityApi + path, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15_000),
  });
}

/** Always returns 204 for accepted shape (anti-enumeration). */
export async function resendEmailVerification(email: string): Promise<void> {
  const response = await identityRequest("/auth/verification/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_slug: tenantSlug(), email }),
  });
  if (response.status === 429) throw new Error("rate_limited");
  if (response.status !== 204 && response.status !== 422) throw new Error("unavailable");
}

export async function verifyEmailByCode(email: string, code: string): Promise<boolean> {
  const response = await identityRequest("/auth/verify-email/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_slug: tenantSlug(), email, code }),
  });
  if (response.status === 200) return true;
  if (response.status === 401 || response.status === 422) return false;
  if (response.status === 429) throw new Error("rate_limited");
  throw new Error("unavailable");
}

export const verificationCodePattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}$/;
