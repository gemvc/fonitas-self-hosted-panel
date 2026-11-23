import { isLocalCustomerToken } from "./customer-session";
import { panelRequest } from "./panel-login";

/**
 * Application identity after sign-in.
 * Shape matches Identity `GET /api/v1/auth/me` (`display_name`, `roles`, `permissions`)
 * plus optional local email verification fields for the OEM profile UI.
 */
export type PanelMe = {
  display_name: string;
  roles: string[];
  permissions: string[];
  email?: string;
  email_verified?: boolean;
};

const localMeKey = "fonitas-local-customer-me";

export function rememberLocalMe(me: PanelMe): void {
  sessionStorage.setItem(localMeKey, JSON.stringify(me));
}

export function clearLocalMe(): void {
  sessionStorage.removeItem(localMeKey);
}

export function updateLocalMe(patch: Partial<PanelMe>): PanelMe | null {
  const saved = sessionStorage.getItem(localMeKey);
  if (!saved) return null;
  const me = { ...(JSON.parse(saved) as PanelMe), ...patch };
  sessionStorage.setItem(localMeKey, JSON.stringify(me));
  return me;
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
    email: typeof data.email === "string" ? data.email : undefined,
    email_verified: typeof data.email_verified === "boolean" ? data.email_verified : undefined,
  };
}

export class SessionEndedError extends Error {
  constructor() {
    super("Panel session ended");
    this.name = "SessionEndedError";
  }
}
