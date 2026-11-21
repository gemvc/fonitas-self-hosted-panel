import { panelRequest } from "./panel-login";

/**
 * Panel identity after sign-in.
 * Backend contract is not verified in Symfony yet — treat as the UI contract this client expects.
 */
export type PanelMe = {
  display_name: string;
  roles: string[];
  permissions: string[];
};

const previewKey = "fonitas-panel-preview-me";

/** Development-only identity so role homes can be reviewed before `/session/me` exists. */
export function setPreviewMe(me: PanelMe | null): void {
  if (!import.meta.env.DEV) return;
  if (me) sessionStorage.setItem(previewKey, JSON.stringify(me));
  else sessionStorage.removeItem(previewKey);
}

export async function loadPanelMe(token: string): Promise<PanelMe> {
  if (import.meta.env.DEV) {
    const preview = sessionStorage.getItem(previewKey);
    if (preview) return JSON.parse(preview) as PanelMe;
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
