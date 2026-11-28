import { isCustomerSection, type CustomerSection } from "./customer-nav";
import { parseAttachParams, shouldOpenGuestShop as checkoutOpensGuestShop } from "./customer-binding";

const POST_AUTH_SECTION_KEY = "fonitas-post-auth-section";

export function shouldOpenGuestShop(search = window.location.search): boolean {
  return checkoutOpensGuestShop(search);
}

/** When logged out with attach params or licenses section, stash for after login. */
export function capturePostAuthIntent(search = window.location.search, hash = window.location.hash): void {
  const params = new URLSearchParams(search);
  const section = params.get("section");
  if (parseAttachParams(search, hash) || section === "licenses") {
    sessionStorage.setItem(POST_AUTH_SECTION_KEY, "licenses");
  }
}

export function stashPostAuthSection(section: CustomerSection): void {
  sessionStorage.setItem(POST_AUTH_SECTION_KEY, section);
}

export function takePostAuthSection(): CustomerSection | null {
  const raw = sessionStorage.getItem(POST_AUTH_SECTION_KEY);
  sessionStorage.removeItem(POST_AUTH_SECTION_KEY);
  return raw && isCustomerSection(raw) ? raw : null;
}

export function initialCustomerSection(
  search = window.location.search,
  fallback: CustomerSection = "overview",
): CustomerSection {
  const fromQuery = new URLSearchParams(search).get("section") ?? "";
  if (isCustomerSection(fromQuery)) return fromQuery;
  return fallback;
}
