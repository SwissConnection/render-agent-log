import assert from "node:assert/strict";
import { test } from "node:test";
import { discountFor, total } from "../src/cart.js";

const items = [
  { price: 12.5, quantity: 2 },
  { price: 50, quantity: 1 },
];

test("no coupon", () => {
  assert.equal(total(items), 75);
});

test("a coupon takes its share off the subtotal", () => {
  assert.equal(total(items, "SAVE10"), 67.5);
  assert.equal(total(items, " save25 "), 56.25);
});

test("an unknown coupon changes nothing", () => {
  assert.equal(discountFor("FREE"), 0);
  assert.equal(total(items, "FREE"), 75);
});
