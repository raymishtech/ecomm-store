import { getStore } from "@/lib/store";
import { handleError, ok } from "@/lib/http";

// Always read live in-memory state; never prerender/cache this route.
export const dynamic = "force-dynamic";

/** GET /api/products — list the catalogue. */
export async function GET() {
  try {
    return ok({ products: getStore().getProducts() });
  } catch (err) {
    return handleError(err);
  }
}
