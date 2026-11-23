import { CUSTOMER_ROLE } from "./roles";
import type { PanelMe } from "./panel-me";

/**
 * On-origin customer session for the OEM/application site UI.
 * Credentials stay on this page; Fonitas verification through same-origin PHP is planned
 * and not wired yet — see engineering handbook first milestone.
 */
export type CustomerSession = {
  access_token: string;
  expires_in: number;
  me: PanelMe;
};

const LOCAL_PREFIX = "local_customer_";

export function isLocalCustomerToken(token: string): boolean {
  return token.startsWith(LOCAL_PREFIX);
}

export function createLocalCustomerSession(displayName: string): CustomerSession {
  const name = displayName.trim() || "Customer";
  return {
    access_token: LOCAL_PREFIX + crypto.randomUUID().replaceAll("-", ""),
    expires_in: 3_600,
    me: {
      display_name: name,
      roles: [CUSTOMER_ROLE],
      permissions: [],
    },
  };
}
