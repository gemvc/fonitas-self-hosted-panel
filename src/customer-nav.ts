/**
 * Buyer sidebar sections for one application on the OEM subdomain.
 * Account items (password, payment methods, email) live under Profile — not separate nav entries.
 */
export const CUSTOMER_SECTIONS = [
  "overview",
  "buy",
  "licenses",
  "subscriptions",
  "billing",
  "support",
  "profile",
] as const;

export type CustomerSection = (typeof CUSTOMER_SECTIONS)[number];

export function isCustomerSection(value: string): value is CustomerSection {
  return (CUSTOMER_SECTIONS as readonly string[]).includes(value);
}
