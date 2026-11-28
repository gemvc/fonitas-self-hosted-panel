/** Pure filters for OEM-bound application scoping (testable without fetch). */

export type BoundPurchase = {
  id: string;
  application_id: string;
  status: string;
  validity?: {
    status?: string;
    runtime_valid_until?: string | null;
    support_valid_until?: string | null;
    support_active?: boolean;
  } | null;
  purchase_snapshot?: {
    application_name?: string;
    runtime_term?: string;
    billing_model?: string;
    seats?: number;
    devices_per_seat?: number;
    edition_id?: string;
    pricing?: { amount?: string; currency?: string };
  } | null;
  issued_at?: string;
  revoked_at?: string | null;
};

export type BoundCatalogListing = {
  id: string;
  application_id: string;
  name: string;
  description?: string;
  platforms?: string[];
  offers: Array<{
    id: string;
    title: string;
    checkout_ready: boolean;
    discount_percent?: number;
    license_definition?: {
      license_terms?: { runtime_term?: string; seats?: number; devices_per_seat?: number };
      billing_model?: string;
      pricing?: { amount?: string; currency?: string };
    };
  }>;
};

export function filterPurchasesForApplication(
  purchases: BoundPurchase[],
  applicationId: string | null,
): BoundPurchase[] {
  if (!applicationId) return [];
  const id = applicationId.toLowerCase();
  return purchases.filter(p => p.application_id?.toLowerCase() === id);
}

export function filterCatalogForApplication(
  listings: BoundCatalogListing[],
  applicationId: string | null,
): BoundCatalogListing[] {
  if (!applicationId) return [];
  const id = applicationId.toLowerCase();
  return listings
    .filter(l => l.application_id?.toLowerCase() === id)
    .map(l => ({
      ...l,
      offers: (l.offers ?? []).filter(o => o.checkout_ready !== false),
    }))
    .filter(l => l.offers.length > 0);
}

export function isSubscriptionPurchase(purchase: BoundPurchase): boolean {
  const term = purchase.purchase_snapshot?.runtime_term;
  const billing = purchase.purchase_snapshot?.billing_model;
  if (term === "SUBSCRIPTION") return true;
  if (!billing) return false;
  return ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"].includes(billing);
}

export function parseAttachParams(search: string, hash: string): { licenseId: string; signedUrl: string } | null {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const licenseId = (query.get("license_id") || hashParams.get("license_id") || "").trim();
  const signedUrl = (query.get("signed_url") || hashParams.get("signed_url") || "").trim();
  if (!licenseId || !signedUrl) return null;
  if (!/^[0-9a-f-]{36}$/i.test(licenseId)) return null;
  try {
    const url = new URL(signedUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { licenseId, signedUrl };
}
