/**
 * Application-tenant Identity roles that Symfony seeds today.
 * Source: TenantRoleProvisioner in symfony_fonitas.
 * Do not invent panel-only role keys — extend only when Identity provisions them.
 */
export const SEEDED_APP_ROLES = ["APP_OWNER", "APP_ADMIN", "APP_END_USER"] as const;

export type SeededAppRole = (typeof SEEDED_APP_ROLES)[number];

/**
 * Optional custom tenant role key used in Identity API examples/tests.
 * Not seeded. Prefer gating support UI on SUPPORT_ASSIGN_PERMISSION.
 */
export const OPTIONAL_SUPPORT_ROLE = "APP_SUPPORT";

/** Real Support domain permission enforced by Symfony. */
export const SUPPORT_ASSIGN_PERMISSION = "support.ticket.assign";

export type WorkspaceHome = "admin" | "support" | "customer";

const homePriority: Record<WorkspaceHome, number> = {
  admin: 300,
  support: 200,
  customer: 100,
};

export function hasSeededAppRole(roles: readonly string[], role: SeededAppRole): boolean {
  return roles.includes(role);
}

export function canAssignSupport(permissions: readonly string[], roles: readonly string[] = []): boolean {
  return permissions.includes(SUPPORT_ASSIGN_PERMISSION) || roles.includes(OPTIONAL_SUPPORT_ROLE);
}

/** Workspace homes this UI can open from Identity roles and permissions. */
export function homesFrom(me: { roles: readonly string[]; permissions: readonly string[] }): WorkspaceHome[] {
  const homes: WorkspaceHome[] = [];
  if (hasSeededAppRole(me.roles, "APP_OWNER") || hasSeededAppRole(me.roles, "APP_ADMIN")) {
    homes.push("admin");
  }
  if (canAssignSupport(me.permissions, me.roles)) {
    homes.push("support");
  }
  if (hasSeededAppRole(me.roles, "APP_END_USER")) {
    homes.push("customer");
  }
  return homes.sort((a, b) => homePriority[b] - homePriority[a]);
}

export function defaultHome(me: { roles: readonly string[]; permissions: readonly string[] }): WorkspaceHome | null {
  return homesFrom(me)[0] ?? null;
}

export function isWorkspaceHome(value: string): value is WorkspaceHome {
  return value === "admin" || value === "support" || value === "customer";
}
