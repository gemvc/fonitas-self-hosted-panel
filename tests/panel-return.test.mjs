import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldOpenGuestShop } from "../src/customer-binding.ts";

describe("shouldOpenGuestShop", () => {
  it("opens guest shop for checkout return and buy section", () => {
    assert.equal(shouldOpenGuestShop("?checkout=success"), true);
    assert.equal(shouldOpenGuestShop("?checkout=cancel"), true);
    assert.equal(shouldOpenGuestShop("?section=buy"), true);
  });

  it("does not open guest shop for licenses or empty query", () => {
    assert.equal(shouldOpenGuestShop("?section=licenses"), false);
    assert.equal(shouldOpenGuestShop(""), false);
  });
});
