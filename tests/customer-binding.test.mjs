import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCatalogForApplication,
  filterPurchasesForApplication,
  isSubscriptionPurchase,
  parseAttachParams,
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
    const parsed = parseAttachParams(
      "?license_id=11111111-1111-1111-1111-111111111111&signed_url=https%3A%2F%2Fapi.example%2Frecovery",
      "",
    );
    assert.ok(parsed);
    assert.equal(parsed.licenseId, "11111111-1111-1111-1111-111111111111");
    assert.equal(parsed.signedUrl, "https://api.example/recovery");
  });

  it("rejects missing params", () => {
    assert.equal(parseAttachParams("?", "#"), null);
  });
});
