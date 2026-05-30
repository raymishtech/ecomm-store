import { getStore, StoreError } from "@/lib/store";
import { handleError, ok, readJson } from "@/lib/http";

/**
 * POST /api/checkout — place an order from a cart.
 * Body: { cartId, discountCode? }
 *
 * The store validates the discount code before applying it; an invalid code
 * fails the whole checkout (400) rather than silently charging full price.
 */
export async function POST(req: Request) {
  try {
    const { cartId, discountCode } = await readJson<{
      cartId?: string;
      discountCode?: string;
    }>(req);
    if (!cartId) throw new StoreError("cartId is required");
    const order = getStore().checkout(cartId, discountCode ?? null);
    return ok({ order }, 201);
  } catch (err) {
    return handleError(err);
  }
}
