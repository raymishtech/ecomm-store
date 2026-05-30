# Design Decisions

This document records the significant design decisions made while building the
store, in the format requested by the BRD.

---

## Decision: Next.js as a single full-stack codebase

**Context:** The BRD requires backend APIs and lists a frontend as a plus. I
wanted both without maintaining two projects, two build pipelines, and a CORS
story between them.

**Options Considered:**
- Option A: Separate Express/Node backend + a separate React (Vite) frontend.
- Option B: Next.js App Router — React frontend and API route handlers in one
  TypeScript project.

**Choice:** Next.js App Router (Option B).

**Why:** One repo, one language, one `npm install`, and the reviewer runs a
single `npm run dev` to get both the APIs and a working UI. Route handlers under
`app/api/**` are plain `Request`/`Response` functions, so the backend stays
conventional and easy to read. The trade-off is coupling the API to a framework,
but for an exercise of this size the reduction in moving parts is worth far more
than framework independence. The team also noted they primarily use
TypeScript/Node, which this matches.

---

## Decision: In-memory store as a class with a `globalThis` singleton

**Context:** The BRD allows in-memory storage. I still wanted the core logic to
be unit-testable in isolation, and I needed state to persist across many
independent API requests within one server process — including across Next.js
dev hot-reloads.

**Options Considered:**
- Option A: Module-level `let`/`Map` variables (a de-facto module singleton).
- Option B: A `Store` **class** holding all state and logic, plus one shared
  instance cached on `globalThis`.

**Choice:** A `Store` class with a `globalThis`-cached singleton (Option B).

**Why:** A class lets tests do `new Store()` for a clean, isolated fixture per
test — impossible with module-level mutable state, which would leak between
tests. For the running app, caching the single instance on `globalThis` keeps
state alive across requests and survives dev hot-reloads (which re-evaluate
modules and would otherwise reset a plain module variable). The cost is the
small `getStore()` indirection, which is well worth the testability.

---

## Decision: Coupons earned every _n_th order, generated explicitly by admin

**Context:** "Every _n_th order gets a coupon code for x% discount." This leaves
two questions: when exactly is a coupon "earned", and who/what creates it? The
BRD also specifies a distinct admin API whose job is to *generate* a code "if
the condition is satisfied".

**Options Considered:**
- Option A: Auto-issue a coupon during checkout whenever the nth order is placed
  (the admin endpoint would just reveal it).
- Option B: The store tracks order count; the admin `generate` endpoint mints a
  coupon only when the current order count is at an **unclaimed** nth-order
  milestone, tracked via `lastEarnedMilestone` to prevent duplicates.

**Choice:** Admin-driven generation gated on milestone eligibility (Option B).

**Why:** It maps directly onto the admin API the BRD asks for ("generate a code
*if the condition is satisfied*"), keeping the eligibility rule and the minting
action in one obvious place. The `lastEarnedMilestone` guard makes generation
**idempotent per milestone** — hammering the endpoint at order 3 yields exactly
one coupon, not three. The accepted trade-off: if no one generates at a milestone
before more orders push past it, that milestone's coupon is forfeited rather than
queued. That keeps the model simple and is reasonable for a reward program; a
future version could queue unclaimed coupons if desired.

---

## Decision: Validate the discount code at checkout and fail the whole order on an invalid code

**Context:** "The checkout API would validate if the discount code is valid
before giving the discount." When a customer supplies a *bad* code, the system
must decide between silently ignoring it or rejecting the request.

**Options Considered:**
- Option A: Ignore an invalid code and charge full price.
- Option B: Reject checkout with a `400` and a clear reason; only commit the
  order (and mark the code spent) when the code is valid.

**Choice:** Reject on an invalid code (Option B).

**Why:** Silently charging full price after someone enters a coupon is a classic
source of "I was overcharged" complaints. Failing loudly lets the customer fix or
drop the code deliberately. Redemption is also made **atomic**: validate → price
→ record order → mark code used, all in one `checkout` call, so a code can never
be half-applied. Validation logic is shared with a separate read-only
`GET /api/discount/validate` endpoint the UI uses for inline feedback, so the two
paths can't drift. Coupons are **single-use**, which is the safe default for a
reward; usage is recorded with the redeeming order id for auditability.

---

## Decision: Pure pricing functions, separated from the store and HTTP

**Context:** Money math (subtotals, percentage discounts, rounding) is the part
most likely to harbour subtle bugs — floating-point drift, off-by-a-cent
rounding, an out-of-range percentage. I wanted it trivially testable and
impossible to get inconsistent between the cart preview and the final order.

**Options Considered:**
- Option A: Compute totals inline inside route handlers / store methods.
- Option B: Extract `calcSubtotal`, `calcDiscountAmount`, and `roundMoney` into a
  dependency-free `pricing.ts` and reuse them everywhere.

**Choice:** Pure functions in `pricing.ts` (Option B).

**Why:** Pure functions are the cheapest things to unit-test (no server, no
mocks) and they let the cart endpoint and the checkout use the *exact same*
subtotal calculation, so the preview always matches what the customer is charged.
Centralising rounding to two decimals in `roundMoney` (with an `EPSILON` nudge)
keeps `0.1 + 0.2` from leaking into totals, and clamping the percentage to
`[0, 100]` means a malformed coupon can never inflate a price or over-refund.

---

## Decision: Client-owned `cartId` instead of user accounts/auth

**Context:** Carts need to be addressable across requests, but the BRD says
nothing about authentication, and building a login system would add a lot of
surface area unrelated to the assignment's focus (cart, checkout, discounts).

**Options Considered:**
- Option A: Full user accounts with sessions/JWT; carts keyed by user id.
- Option B: An opaque `cartId` chosen by the client (the frontend generates one
  and persists it in `localStorage`), passed on each cart/checkout call.

**Choice:** Client-owned `cartId` (Option B).

**Why:** It satisfies the actual requirement — a stable handle to one cart —
with essentially no auth machinery, keeping the exercise focused. The frontend
transparently creates and reuses an id per browser. The clear trade-off is that
it is **not secure**: anyone who knows a `cartId` can read/modify that cart, and
the admin endpoints are likewise unauthenticated. That's acceptable for an
in-memory demo and is explicitly the first thing I'd harden (admin auth +
user-scoped carts) for production.

---

## Decision: Vitest for the test suite

**Context:** The BRD requires unit tests for the core business logic. I needed a
runner that works cleanly with TypeScript and ES modules without heavy config.

**Options Considered:**
- Option A: Jest (with `ts-jest`/Babel for TS + ESM).
- Option B: Vitest.

**Choice:** Vitest (Option B).

**Why:** Vitest runs TypeScript and ESM out of the box, is fast, and needs only
a tiny config to share the `@/` path alias with the app. Since the core logic
lives in framework-agnostic `lib/` modules, the tests import and exercise it
directly — no Next.js runtime needed — which keeps the suite quick and focused on
behaviour (cart rules, nth-order eligibility, single-use redemption, stats).
