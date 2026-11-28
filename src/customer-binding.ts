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

export type BoundCatalogOffer = {
  id: string;
  title: string;
  checkout_ready: boolean;
  discount_percent?: number;
  license_definition?: {
    license_terms?: {
      runtime_term?: string;
      seats?: number;
      devices_per_seat?: number;
      covered_platforms?: string[];
    };
    billing_model?: string;
    pricing?: {
      amount_minor?: number;
      amount?: string;
      currency?: string;
      billing_period?: string;
    };
  };
};

export type BoundCatalogListing = {
  id: string;
  application_id: string;
  name: string;
  description?: string;
  platforms?: string[];
  offers: BoundCatalogOffer[];
};

export type OfferDisplay = {
  title: string;
  priceLabel: string;
  billingLabel: string;
  seatsLabel: string | null;
  platformsLabel: string | null;
};

/** Format catalog offer fields for Buy cards (pure / testable). */
export function formatCatalogOfferDisplay(
  listing: BoundCatalogListing,
  offer: BoundCatalogOffer,
): OfferDisplay {
  const def = offer.license_definition;
  const pricing = def?.pricing;
  const currency = (pricing?.currency || "EUR").toUpperCase();
  let priceLabel = "—";
  if (def?.billing_model === "FREEMIUM" || pricing?.amount_minor === 0) {
    priceLabel = `0.00 ${currency}`;
  } else if (typeof pricing?.amount_minor === "number") {
    priceLabel = `${(pricing.amount_minor / 100).toFixed(2)} ${currency}`;
  } else if (pricing?.amount) {
    priceLabel = `${pricing.amount} ${currency}`;
  }
  const billing = def?.billing_model
    || pricing?.billing_period
    || def?.license_terms?.runtime_term
    || "—";
  const seats = def?.license_terms?.seats;
  const platforms = (def?.license_terms?.covered_platforms?.length
    ? def.license_terms.covered_platforms
    : listing.platforms) ?? [];
  return {
    title: offer.title || listing.name,
    priceLabel,
    billingLabel: String(billing),
    seatsLabel: seats != null ? String(seats) : null,
    platformsLabel: platforms.length > 0 ? platforms.join(", ") : null,
  };
}

export function parseCheckoutReturn(search: string): "success" | "cancel" | null {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = (query.get("checkout") || "").trim().toLowerCase();
  if (value === "success" || value === "cancel") return value;
  return null;
}

/** Cold Stripe/buy return should open guest shop without forcing sign-in first. */
export function shouldOpenGuestShop(search = ""): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const checkout = (params.get("checkout") || "").trim().toLowerCase();
  const section = (params.get("section") || "").trim().toLowerCase();
  return checkout === "success" || checkout === "cancel" || section === "buy";
}

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

export function isTicketClosed(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "CLOSED";
}

const LICENSE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract license id + signed backend URL from query, `#recovery=`, or a pasted capability URL. */
export function parseAttachParams(search: string, hash: string): { licenseId: string; signedUrl: string } | null {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(rawHash);

  const recovery = (hashParams.get("recovery") || "").trim();
  if (recovery) {
    const licenseId = licenseIdFromSignedUrl(recovery);
    if (licenseId) return { licenseId, signedUrl: recovery };
  }

  let licenseId = (query.get("license_id") || hashParams.get("license_id") || "").trim();
  let signedUrl = (query.get("signed_url") || hashParams.get("signed_url") || "").trim();
  if (!signedUrl && licenseId.startsWith("http")) {
    signedUrl = licenseId;
    licenseId = "";
  }
  if (signedUrl && !licenseId) {
    licenseId = licenseIdFromSignedUrl(signedUrl) ?? "";
  }
  if (!licenseId || !signedUrl || !LICENSE_ID_RE.test(licenseId)) return null;
  try {
    const url = new URL(signedUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { licenseId, signedUrl };
}

export function licenseIdFromSignedUrl(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl);
    const match = url.pathname.match(/\/license\/purchases\/([0-9a-f-]{36})\/?$/i);
    return match?.[1] && LICENSE_ID_RE.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

/** Resolve attach form fields; accepts one pasted recovery page or capability URL. */
export function resolveAttachFields(licenseIdInput: string, signedUrlInput: string): { licenseId: string; signedUrl: string } | null {
  const a = licenseIdInput.trim();
  const b = signedUrlInput.trim();
  for (const value of [a, b]) {
    if (value.includes("#recovery=")) {
      const parsed = parseAttachParams("", value.slice(value.indexOf("#")));
      if (parsed) return parsed;
    }
  }
  return parseAttachParams(
    a && !a.startsWith("http") ? `?license_id=${encodeURIComponent(a)}` : "?",
    b
      ? `#signed_url=${encodeURIComponent(b)}`
      : a.startsWith("http")
        ? `#signed_url=${encodeURIComponent(a)}`
        : "#",
  );
}
