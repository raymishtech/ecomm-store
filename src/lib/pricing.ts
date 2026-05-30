/**
 * Pure pricing helpers.
 *
 * These functions hold the money math and have no knowledge of the store or
 * HTTP. Keeping them pure makes the core rules trivial to unit test and reuse.
 */

/** Round to 2 decimal places to keep currency totals stable. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Sum of price * quantity across lines, rounded to cents. */
export function calcSubtotal(lines: { price: number; quantity: number }[]): number {
  const raw = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return roundMoney(raw);
}

/**
 * Absolute discount for a given subtotal and percentage.
 * Clamps the percentage to [0, 100] so a bad coupon can never inflate a total
 * or refund more than the order is worth.
 */
export function calcDiscountAmount(subtotal: number, percentOff: number): number {
  const pct = Math.min(Math.max(percentOff, 0), 100);
  return roundMoney(subtotal * (pct / 100));
}
