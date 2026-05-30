# Ecomm Store

A small ecommerce backend (plus a frontend, which the BRD lists as a plus) built
with **Next.js (App Router)** in TypeScript. Customers add items to a cart and
check out; **every _n_th order earns an _x_% single-use coupon** that can be
applied at checkout. Two admin endpoints generate coupons and report store
stats.

Storage is **in-memory** (no database), as permitted by the assignment. State
resets when the server restarts.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

- Storefront: <http://localhost:3000>
- Admin dashboard: <http://localhost:3000/admin>

Run the tests and a production build:

```bash
npm test             # unit tests for the core business logic (Vitest)
npm run build        # type-check + production build
npm start            # run the production build
```

### Configuration

The discount policy is tunable via environment variables (defaults shown):

| Variable           | Default | Meaning                                   |
| ------------------ | ------- | ----------------------------------------- |
| `NTH_ORDER`        | `3`     | Every Nth order earns a coupon            |
| `DISCOUNT_PERCENT` | `10`    | Percentage off granted by an earned coupon |

```bash
NTH_ORDER=5 DISCOUNT_PERCENT=15 npm run dev
```

---

## How the discount system works

1. Customers place orders. The store counts them.
2. When the order count hits a multiple of `NTH_ORDER` (3rd, 6th, 9th, …) a
   coupon is **earned**.
3. An admin calls **`POST /api/admin/discount`** to mint the coupon for that
   milestone. It only succeeds at an unclaimed milestone, and never mints two
   coupons for the same milestone.
4. The coupon (`SAVE10-1`, etc.) gives `DISCOUNT_PERCENT`% off the **subtotal**
   and is **single-use** — it is validated at checkout and marked spent once
   redeemed.

See [`DECISIONS.md`](./DECISIONS.md) for the reasoning behind these choices.

---

## API reference

All request/response bodies are JSON. Expected, client-correctable errors return
`400` with `{ "error": "..." }`.

### Catalogue

| Method | Path            | Description           |
| ------ | --------------- | --------------------- |
| `GET`  | `/api/products` | List seeded products. |

### Cart

The cart is identified by a `cartId` the client owns (any opaque string). The
frontend generates one and stores it in `localStorage`.

| Method  | Path        | Body / Query                              | Description                                       |
| ------- | ----------- | ----------------------------------------- | ------------------------------------------------- |
| `GET`   | `/api/cart` | `?cartId=demo`                            | View a cart and its subtotal.                     |
| `POST`  | `/api/cart` | `{ cartId, productId, quantity }`         | Add an item (quantities accumulate).              |
| `PATCH` | `/api/cart` | `{ cartId, productId, quantity }`         | Set a line's absolute quantity (`0` removes it).  |

### Checkout

| Method | Path            | Body                              | Description                                                 |
| ------ | --------------- | --------------------------------- | ---------------------------------------------------------- |
| `POST` | `/api/checkout` | `{ cartId, discountCode? }`       | Place an order. Invalid coupon ⇒ `400`, whole checkout fails. |

### Discount validation

| Method | Path                     | Query        | Description                                                |
| ------ | ------------------------ | ------------ | --------------------------------------------------------- |
| `GET`  | `/api/discount/validate` | `?code=SAVE10-1` | Check a code without redeeming it. Always `200` with `{ valid, percentOff? / reason? }`. |

### Admin

| Method | Path                  | Description                                                               |
| ------ | --------------------- | ------------------------------------------------------------------------ |
| `POST` | `/api/admin/discount` | **Generate a coupon** if at an unclaimed nth-order milestone, else `400`. |
| `GET`  | `/api/admin/discount` | List all coupons and their status.                                       |
| `GET`  | `/api/admin/stats`    | Orders, items purchased, revenue, total discount given, and all coupons. |

> Note: the admin endpoints are unauthenticated for this exercise. In production
> they would sit behind admin auth — see `DECISIONS.md`.

### Example flow with `curl`

```bash
B=http://localhost:3000

# Add to cart and check out three times to reach the milestone (NTH_ORDER=3)
for c in a b c; do
  curl -s -X POST $B/api/cart -d "{\"cartId\":\"$c\",\"productId\":\"p1\",\"quantity\":1}" >/dev/null
  curl -s -X POST $B/api/checkout -d "{\"cartId\":\"$c\"}" >/dev/null
done

# Admin mints the earned coupon
CODE=$(curl -s -X POST $B/api/admin/discount | python3 -c "import sys,json;print(json.load(sys.stdin)['discountCode']['code'])")

# Redeem it on the next order
curl -s -X POST $B/api/cart -d '{"cartId":"d","productId":"p3","quantity":1}' >/dev/null
curl -s -X POST $B/api/checkout -d "{\"cartId\":\"d\",\"discountCode\":\"$CODE\"}"

# Inspect the store
curl -s $B/api/admin/stats
```

A ready-to-import **Postman collection** is included:
[`postman_collection.json`](./postman_collection.json).

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # Storefront (cart + checkout UI)
│   ├── admin/page.tsx           # Admin dashboard (stats + generate coupon)
│   ├── layout.tsx, globals.css  # Shell + styling
│   └── api/                     # Route handlers (the backend)
│       ├── products/route.ts
│       ├── cart/route.ts
│       ├── checkout/route.ts
│       ├── discount/validate/route.ts
│       └── admin/
│           ├── discount/route.ts
│           └── stats/route.ts
└── lib/
    ├── types.ts                 # Domain types
    ├── config.ts                # Discount policy (env-tunable)
    ├── pricing.ts               # Pure money math  (+ pricing.test.ts)
    ├── store.ts                 # In-memory store + business logic (+ store.test.ts)
    └── http.ts                  # Shared route helpers
```

The HTTP layer is intentionally thin: route handlers parse input, call one
`Store` method, and shape the response. All rules live in `lib/` so they can be
unit-tested without spinning up a server.

## Tests

`npm test` runs the Vitest suite (23 tests):

- **`pricing.test.ts`** — subtotal/discount math and currency rounding.
- **`store.test.ts`** — cart behaviour, checkout, nth-order coupon eligibility
  and de-duplication, single-use redemption, and stats aggregation.

## Notes on dependencies

`npm audit` reports advisories in `next@14.2.x` (DoS-class issues fixed only in
Next 16) and in dev-only transitive packages. The app stays on the latest
patched **14.2.35** to avoid a risky major upgrade for a demo; none of the
flagged vectors (e.g. `next/image` remote patterns) are used here.
