import { getStore } from "@/lib/store";
import { handleError, ok } from "@/lib/http";

// Always read live in-memory state; never prerender/cache this route.
export const dynamic = "force-dynamic";

/**
 * Admin API #1 — generate a discount code.
 *
 * POST /api/admin/discount
 * Succeeds (201) only when the store is at an unclaimed nth-order milestone;
 * otherwise returns 400 explaining why no coupon is available yet.
 *
 * NOTE: In a real system this would sit behind admin authentication. That is
 * called out as out-of-scope in DECISIONS.md.
 */
export async function POST() {
  try {
    const code = getStore().generateDiscountCode();
    return ok({ discountCode: code }, 201);
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/admin/discount — list every coupon and its status. */
export async function GET() {
  try {
    return ok({ discountCodes: getStore().getDiscountCodes() });
  } catch (err) {
    return handleError(err);
  }
}
