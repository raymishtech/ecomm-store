/**
 * Tunable rules for the discount system.
 *
 * Kept in one place (and overridable via environment variables) so the
 * "every nth order earns an x% coupon" policy can be changed without touching
 * business logic. Defaults are small so the behaviour is easy to demo and test.
 */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CONFIG = {
  /** Every Nth order earns a coupon. e.g. 3 => orders 3, 6, 9, ... */
  nthOrder: intFromEnv("NTH_ORDER", 3),
  /** Percentage discount granted by an earned coupon. */
  discountPercent: intFromEnv("DISCOUNT_PERCENT", 10),
} as const;
