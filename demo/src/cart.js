const coupons = { SAVE10: 10, SAVE25: 25 };

// The discount a coupon code gives, as a fraction of the subtotal.
export function discountFor(code) {
  return coupons[code.trim().toUpperCase()] ?? 0;
}

export function total(items, code = "") {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(subtotal * (1 - discountFor(code)) * 100) / 100;
}
