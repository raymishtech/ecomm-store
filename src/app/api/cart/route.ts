import { getStore } from "@/lib/store";
import { handleError, ok, readJson } from "@/lib/http";
import { StoreError } from "@/lib/store";
import { calcSubtotal } from "@/lib/pricing";

// Reads the request URL/body and live store state; must not be prerendered.
export const dynamic = "force-dynamic";

/**
 * Cart endpoints. The cart is identified by a `cartId` the client owns (see
 * DECISIONS.md) — passed as a query param on GET and in the body on writes.
 */

/** GET /api/cart?cartId=... — view a cart with a computed subtotal. */
export async function GET(req: Request) {
  try {
    const cartId = new URL(req.url).searchParams.get("cartId");
    if (!cartId) throw new StoreError("cartId is required");
    const store = getStore();
    const cart = store.getCart(cartId);
    return ok({ cart, subtotal: subtotalOf(store, cart.items) });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/cart — add an item: { cartId, productId, quantity }. */
export async function POST(req: Request) {
  try {
    const { cartId, productId, quantity } = await readJson<{
      cartId?: string;
      productId?: string;
      quantity?: number;
    }>(req);
    if (!cartId) throw new StoreError("cartId is required");
    if (!productId) throw new StoreError("productId is required");
    const store = getStore();
    const cart = store.addToCart(cartId, productId, quantity ?? 1);
    return ok({ cart, subtotal: subtotalOf(store, cart.items) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/cart — set an item's absolute quantity (0 removes it):
 * { cartId, productId, quantity }.
 */
export async function PATCH(req: Request) {
  try {
    const { cartId, productId, quantity } = await readJson<{
      cartId?: string;
      productId?: string;
      quantity?: number;
    }>(req);
    if (!cartId) throw new StoreError("cartId is required");
    if (!productId) throw new StoreError("productId is required");
    if (quantity === undefined) throw new StoreError("quantity is required");
    const store = getStore();
    const cart = store.setCartItemQuantity(cartId, productId, quantity);
    return ok({ cart, subtotal: subtotalOf(store, cart.items) });
  } catch (err) {
    return handleError(err);
  }
}

function subtotalOf(
  store: ReturnType<typeof getStore>,
  items: { productId: string; quantity: number }[]
): number {
  const lines = items.map((i) => ({
    price: store.getProduct(i.productId)?.price ?? 0,
    quantity: i.quantity,
  }));
  // Reuse the same pure helper the store uses internally.
  return calcSubtotal(lines);
}
