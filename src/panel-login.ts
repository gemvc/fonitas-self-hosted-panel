export const panelApi = "https://api.fonitas.com/api/v1/developer-panels";

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
