/** Known application roles. Add entries here when new roles ship; unknown keys stay inert. */
export const ROLE_KEYS = [
  "application_admin",
  "application_support",
  "application_customer",
] as const;

export type KnownRoleKey = (typeof ROLE_KEYS)[number];
export type RoleKey = KnownRoleKey | (string & {});

export type RoleAbility =
  | "admin.overview"
  | "support.tickets"
  | "customer.purchases";

export type RoleDefinition = {
  key: KnownRoleKey;
  /** Higher wins when choosing the default home. */
  priority: number;
  abilities: readonly RoleAbility[];
  /** Deep administration stays on the hosted Fonitas portal. */
  hostedAdmin?: boolean;
};

export const roleRegistry: Record<KnownRoleKey, RoleDefinition> = {
  application_admin: {
    key: "application_admin",
    priority: 300,
    abilities: ["admin.overview"],
    hostedAdmin: true,
  },
  application_support: {
    key: "application_support",
    priority: 200,
    abilities: ["support.tickets"],
  },
  application_customer: {
    key: "application_customer",
    priority: 100,
    abilities: ["customer.purchases"],
  },
};

export function isKnownRole(role: string): role is KnownRoleKey {
  return Object.hasOwn(roleRegistry, role);
}

/** Roles this UI understands, highest priority first. Unknown future roles are ignored until registered. */
export function knownRolesFrom(roles: readonly string[]): KnownRoleKey[] {
  return ROLE_KEYS
    .filter(key => roles.includes(key))
    .sort((a, b) => roleRegistry[b].priority - roleRegistry[a].priority);
}

export function defaultRole(roles: readonly string[]): KnownRoleKey | null {
  return knownRolesFrom(roles)[0] ?? null;
}

export function can(roles: readonly string[], ability: RoleAbility): boolean {
  return knownRolesFrom(roles).some(key => roleRegistry[key].abilities.includes(ability));
}
