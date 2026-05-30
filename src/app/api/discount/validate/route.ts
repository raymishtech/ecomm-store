import { getStore, StoreError } from "@/lib/store";
import { handleError, ok } from "@/lib/http";

// Reads the request URL and live store state; must not be prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/discount/validate?code=... — check a code without redeeming it.
 * Always returns 200 with a { valid, reason?/percentOff? } payload so the
 * frontend can show inline feedback as the customer types.
 */
export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code");
    if (!code) throw new StoreError("code is required");
    return ok(getStore().validateDiscount(code));
  } catch (err) {
    return handleError(err);
  }
}
