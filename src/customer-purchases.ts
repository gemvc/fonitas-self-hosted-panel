import { resolveBoundApplicationId } from "./bound-application";
import {
  filterPurchasesForApplication,
  isSubscriptionPurchase,
  type BoundPurchase,
} from "./customer-binding";
import { customerJson, CustomerApiError } from "./customer-api";

type PurchasesResponse = {
  data: BoundPurchase[];
  meta: { page: number; per_page: number; total: number; last_page: number };
};

export async function listBoundPurchases(): Promise<BoundPurchase[]> {
  const applicationId = await resolveBoundApplicationId();
  const body = await customerJson<PurchasesResponse>("/license/me/purchases?per_page=100");
  return filterPurchasesForApplication(body.data ?? [], applicationId);
}

export async function attachPurchase(licenseId: string, signedUrl: string): Promise<void> {
  await customerJson<void>(`/license/me/purchases/${encodeURIComponent(licenseId)}/attach`, {
    method: "POST",
    body: JSON.stringify({ signed_url: signedUrl }),
  });
}

export async function startCheckout(input: {
  offerId: string;
  buyerEmail: string;
  idempotencyKey?: string;
}): Promise<{ checkout_url: string | null; id: string; status: string }> {
  const key = input.idempotencyKey
    || (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `oem-${Date.now()}`);
  const body = await customerJson<{
    data: { id: string; checkout_url: string | null; status: string };
  }>("/payments/checkouts", {
    method: "POST",
    csrf: false,
    body: JSON.stringify({
      offer_id: input.offerId,
      buyer_email: input.buyerEmail,
      currency: "EUR",
      idempotency_key: key.slice(0, 64),
    }),
  });
  return {
    id: body.data.id,
    checkout_url: body.data.checkout_url,
    status: body.data.status,
  };
}

export { isSubscriptionPurchase, CustomerApiError };
export type { BoundPurchase };
