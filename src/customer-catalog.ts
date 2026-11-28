import { resolveBoundApplicationId } from "./bound-application";
import { filterCatalogForApplication, type BoundCatalogListing } from "./customer-binding";
import { customerJson } from "./customer-api";

type CatalogResponse = {
  data: BoundCatalogListing[];
  meta: { page?: number; per_page?: number; total?: number };
};

/** Public catalog filtered to the OEM-bound application (OPEN checkout-ready offers). */
export async function listBoundCatalogOffers(): Promise<BoundCatalogListing[]> {
  const applicationId = await resolveBoundApplicationId();
  const body = await customerJson<CatalogResponse>("/catalog/applications?per_page=100");
  return filterCatalogForApplication(body.data ?? [], applicationId);
}
