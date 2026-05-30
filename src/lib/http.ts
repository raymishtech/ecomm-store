/**
 * Small helpers shared by the route handlers to keep them thin and consistent.
 */
import { NextResponse } from "next/server";
import { isStoreError, StoreError } from "./store";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Maps thrown errors to responses: expected `StoreError`s become 400s with the
 * message; anything else is an unexpected 500 (message hidden from the client).
 */
export function handleError(err: unknown) {
  if (isStoreError(err)) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  console.error("Unexpected error:", err);
  return NextResponse.json({ error: "internal server error" }, { status: 500 });
}

/** Parses a JSON body, tolerating an empty body (returns {}). */
export async function readJson<T = Record<string, unknown>>(
  req: Request
): Promise<T> {
  try {
    const text = await req.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new StoreError("invalid JSON body");
  }
}
