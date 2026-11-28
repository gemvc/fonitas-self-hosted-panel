/**
 * Installation-bound application id for OEM Buy / Licenses filtering (C-02 / C-03 client).
 * Prefer local env override, then customer PHP `/api/bound-application`, then OEM setup public view.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedId: string | null | undefined;
let resolvePromise: Promise<string | null> | null = null;

function envApplicationId(): string | null {
  const raw = String(import.meta.env?.VITE_APPLICATION_ID ?? "").trim();
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

async function fetchJsonId(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as {
      application_id?: string;
      data?: { application_id?: string; application?: { public_id?: string } };
    };
    const id = (
      body.application_id
      || body.data?.application_id
      || body.data?.application?.public_id
      || ""
    ).trim();
    return UUID_RE.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Resolve the OEM-bound application UUID, or null when unavailable. */
export async function resolveBoundApplicationId(): Promise<string | null> {
  if (cachedId !== undefined) return cachedId;
  if (!resolvePromise) {
    resolvePromise = (async () => {
      const fromEnv = envApplicationId();
      if (fromEnv) {
        cachedId = fromEnv;
        return fromEnv;
      }
      const fromCustomerApi = await fetchJsonId("/api/bound-application");
      if (fromCustomerApi) {
        cachedId = fromCustomerApi;
        return fromCustomerApi;
      }
      // Optional installer public view when customer PHP is not on this host.
      const fromSetup = await fetchJsonId("/index.php?view=bound-application");
      cachedId = fromSetup;
      return fromSetup;
    })().finally(() => {
      resolvePromise = null;
    });
  }
  return resolvePromise;
}

/** Test helper / logout reset. */
export function clearBoundApplicationIdCache(): void {
  cachedId = undefined;
}
