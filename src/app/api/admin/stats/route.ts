import { getStore } from "@/lib/store";
import { handleError, ok } from "@/lib/http";

// Always read live in-memory state; never prerender/cache this route.
export const dynamic = "force-dynamic";

/**
 * Admin API #2 — store stats.
 *
 * GET /api/admin/stats
 * Returns total orders, items purchased, revenue, total discount given, and the
 * full list of discount codes.
 */
export async function GET() {
  try {
    return ok(getStore().getStats());
  } catch (err) {
    return handleError(err);
  }
}
