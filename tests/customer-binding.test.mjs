import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCatalogForApplication,
  filterPurchasesForApplication,
  formatCatalogOfferDisplay,
  isSubscriptionPurchase,
  isTicketClosed,
  parseAttachParams,
  parseCheckoutReturn,
  resolveAttachFields,
} from "../src/customer-binding.ts";

describe("filterPurchasesForApplication", () => {
  const app = "11111111-1111-1111-1111-111111111111";
  const rows = [
    { id: "a", application_id: app, status: "ACTIVE" },
    { id: "b", application_id: "22222222-2222-2222-2222-222222222222", status: "ACTIVE" },
  ];

  it("returns empty without bound application", () => {
    assert.equal(filterPurchasesForApplication(rows, null).length, 0);
  });

  it("keeps only matching application_id", () => {
    const filtered = filterPurchasesForApplication(rows, app);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "a");
  });
});

describe("filterCatalogForApplication", () => {
  const app = "11111111-1111-1111-1111-111111111111";
  const listings = [
    {
      id: "l1",
      application_id: app,
      name: "App",
      offers: [
        { id: "o1", title: "Ready", checkout_ready: true },
        { id: "o2", title: "Not", checkout_ready: false },
      ],
    },
    {
      id: "l2",
      application_id: "22222222-2222-2222-2222-222222222222",
      name: "Other",
      offers: [{ id: "o3", title: "X", checkout_ready: true }],
    },
  ];

  it("filters listings and checkout_ready offers", () => {
    const filtered = filterCatalogForApplication(listings, app);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].offers.length, 1);
    assert.equal(filtered[0].offers[0].id, "o1");
  });
});

describe("isSubscriptionPurchase", () => {
  it("detects subscription runtime_term", () => {
    assert.equal(
      isSubscriptionPurchase({
        id: "1",
        application_id: "x",
        status: "ACTIVE",
        purchase_snapshot: { runtime_term: "SUBSCRIPTION" },
      }),
      true,
    );
  });

  it("detects monthly billing_model", () => {
    assert.equal(
      isSubscriptionPurchase({
        id: "1",
        application_id: "x",
        status: "ACTIVE",
        purchase_snapshot: { billing_model: "MONTHLY" },
      }),
      true,
    );
  });
});

describe("parseAttachParams", () => {
  it("reads license_id and signed_url from query", () => {
    const signed = "https://api.example/api/v1/license/purchases/11111111-1111-1111-1111-111111111111?delivery=x";
    const parsed = parseAttachParams(
      `?license_id=11111111-1111-1111-1111-111111111111&signed_url=${encodeURIComponent(signed)}`,
      "",
    );
    assert.ok(parsed);
    assert.equal(parsed.licenseId, "11111111-1111-1111-1111-111111111111");
    assert.equal(parsed.signedUrl, signed);
  });

  it("reads Symfony #recovery= capability URL", () => {
    const signed = "https://api.fonitas.com/api/v1/license/purchases/22222222-2222-2222-2222-222222222222?delivery=abc&_hash=z";
    const parsed = parseAttachParams("", `#recovery=${encodeURIComponent(signed)}`);
    assert.ok(parsed);
    assert.equal(parsed.licenseId, "22222222-2222-2222-2222-222222222222");
    assert.equal(parsed.signedUrl, signed);
  });

  it("rejects missing params", () => {
    assert.equal(parseAttachParams("?", "#"), null);
  });
});

describe("resolveAttachFields", () => {
  it("accepts a single pasted recovery page URL", () => {
    const signed = "https://api.fonitas.com/api/v1/license/purchases/33333333-3333-3333-3333-333333333333?delivery=1";
    const parsed = resolveAttachFields(`https://oem.example/purchase#recovery=${encodeURIComponent(signed)}`, "");
    assert.ok(parsed);
    assert.equal(parsed.licenseId, "33333333-3333-3333-3333-333333333333");
  });
});

describe("isTicketClosed", () => {
  it("detects closed status", () => {
    assert.equal(isTicketClosed("CLOSED"), true);
    assert.equal(isTicketClosed("closed"), true);
    assert.equal(isTicketClosed("OPEN"), false);
  });
});

describe("formatCatalogOfferDisplay", () => {
  it("formats price from amount_minor and billing", () => {
    const listing = {
      id: "l1",
      application_id: "11111111-1111-1111-1111-111111111111",
      name: "App",
      platforms: ["WEB"],
      offers: [],
    };
    const offer = {
      id: "o1",
      title: "Pro",
      checkout_ready: true,
      license_definition: {
        billing_model: "YEARLY",
        license_terms: { seats: 2, runtime_term: "SUBSCRIPTION" },
        pricing: { amount_minor: 1999, currency: "EUR", billing_period: "YEARLY" },
      },
    };
    const display = formatCatalogOfferDisplay(listing, offer);
    assert.equal(display.title, "Pro");
    assert.equal(display.priceLabel, "19.99 EUR");
    assert.equal(display.billingLabel, "YEARLY");
    assert.equal(display.seatsLabel, "2");
    assert.equal(display.platformsLabel, "WEB");
  });

  it("shows free for FREEMIUM", () => {
    const listing = {
      id: "l1",
      application_id: "11111111-1111-1111-1111-111111111111",
      name: "App",
      offers: [],
    };
    const display = formatCatalogOfferDisplay(listing, {
      id: "o1",
      title: "Free",
      checkout_ready: true,
      license_definition: { billing_model: "FREEMIUM", pricing: { amount_minor: 0, currency: "EUR" } },
    });
    assert.equal(display.priceLabel, "0.00 EUR");
  });
});

describe("parseCheckoutReturn", () => {
  it("reads success and cancel", () => {
    assert.equal(parseCheckoutReturn("?checkout=success"), "success");
    assert.equal(parseCheckoutReturn("checkout=cancel"), "cancel");
    assert.equal(parseCheckoutReturn(""), null);
  });
});
