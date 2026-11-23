/**
 * Application-tenant Identity roles that Symfony seeds today.
 * Source: TenantRoleProvisioner in symfony_fonitas.
 * Do not invent panel-only role keys — extend only when Identity provisions them.
 *
 * Product direction: this dashboard ships for APP_END_USER (customer) only.
 * Other seeded roles stay documented for Fonitas-hosted surfaces.
 */
export const CUSTOMER_ROLE = "APP_END_USER" as const;

export const SEEDED_APP_ROLES = ["APP_OWNER", "APP_ADMIN", "APP_END_USER"] as const;

export type SeededAppRole = (typeof SEEDED_APP_ROLES)[number];

/** True when Identity grants the local customer dashboard. */
export function isCustomer(roles: readonly string[]): boolean {
  return roles.includes(CUSTOMER_ROLE);
}
