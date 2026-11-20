export const panelApi = "https://api.fonitas.com/api/v1/developer-panels";
const hostedSignIn = "https://developerpannel.fonitas.com/connect-panel";
const pendingSignInKey = "fonitas-panel-sign-in";
const hex64 = /^[0-9a-f]{64}$/;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function startPanelSignIn(): Promise<void> {
  const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
  const state = hex(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(pendingSignInKey, JSON.stringify({ state, verifier }));
  const url = new URL(hostedSignIn);
  url.search = new URLSearchParams({ origin: window.location.origin, state, challenge }).toString();
  window.location.assign(url);
}

export function panelRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(panelApi + path, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15_000),
  });
}

export interface PanelSession {
  access_token: string;
  expires_in: number;
}

export function completePanelSignIn(): Promise<PanelSession> | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!fragment.has("code") && !fragment.has("state")) return null;

  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return exchange(fragment);
}

async function exchange(fragment: URLSearchParams): Promise<PanelSession> {
  const pending = sessionStorage.getItem(pendingSignInKey);
  sessionStorage.removeItem(pendingSignInKey);
  const saved = pending ? JSON.parse(pending) as { state?: string; verifier?: string } : null;
  const code = fragment.get("code") ?? "";
  if (!saved?.state || saved.state !== fragment.get("state") || !hex64.test(saved.verifier ?? "") || !hex64.test(code)) {
    throw new Error("Invalid sign-in response");
  }

  const response = await panelRequest("/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier: saved.verifier }),
  });
  if (!response.ok) throw new Error("Panel sign-in failed");
  const { data } = await response.json() as { data: PanelSession };
  return data;
}
