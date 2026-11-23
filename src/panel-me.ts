import { isLocalCustomerToken } from "./customer-session";
import { panelRequest } from "./panel-login";

/**
 * Application identity after sign-in.
 * Shape matches Identity `GET /api/v1/auth/me` (`display_name`, `roles`, `permissions`).
 * Local OEM sessions supply identity in-memory. Developer-panel bearer `/session/me` is unverified.
 */
export type PanelMe = {
  display_name: string;
  roles: string[];
  permissions: string[];
};

const localMeKey = "fonitas-local-customer-me";

export function rememberLocalMe(me: PanelMe): void {
  sessionStorage.setItem(localMeKey, JSON.stringify(me));
}

export function clearLocalMe(): void {
  sessionStorage.removeItem(localMeKey);
}

export async function loadPanelMe(token: string): Promise<PanelMe> {
  if (isLocalCustomerToken(token)) {
    const saved = sessionStorage.getItem(localMeKey);
    if (!saved) throw new SessionEndedError();
    const me = JSON.parse(saved) as PanelMe;
    if (!Array.isArray(me.roles) || typeof me.display_name !== "string") throw new SessionEndedError();
    return me;
  }

  const response = await panelRequest("/session/me", {
    headers: { Authorization: "Bearer " + token },
  });
  if ([401, 403, 404].includes(response.status)) {
    throw new SessionEndedError();
  }
  if (!response.ok) throw new Error("Failed to load panel identity");
  const { data } = await response.json() as { data: PanelMe };
  if (!Array.isArray(data.roles) || !Array.isArray(data.permissions) || typeof data.display_name !== "string") {
    throw new Error("Invalid panel identity");
  }
  return {
    display_name: data.display_name,
    roles: data.roles.filter((role): role is string => typeof role === "string"),
    permissions: data.permissions.filter((permission): permission is string => typeof permission === "string"),
  };
}

export class SessionEndedError extends Error {
  constructor() {
    super("Panel session ended");
    this.name = "SessionEndedError";
  }
}
