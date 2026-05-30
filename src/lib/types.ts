/**
 * Domain types for the ecommerce store.
 *
 * All monetary values are stored as numbers representing the store's currency
 * unit (e.g. USD). Pricing math is centralised in `pricing.ts` and rounds to two
 * decimal places to avoid floating-point drift creeping into totals.
 */

export interface Product {
  id: string;
  name: string;
  /** Unit price in the store currency. */
  price: number;
}

/** A line in a cart: a reference to a product plus how many of it. */
export interface CartItem {
  productId: string;
  quantity: number;
}

/** A cart is identified by an opaque id supplied by the client (see DECISIONS.md). */
export interface Cart {
  id: string;
  items: CartItem[];
}

/**
 * A cart line resolved into a snapshot for an order. We copy name/price at
 * checkout time so a later price change does not rewrite historical orders.
 */
export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  /** Sum of line totals before any discount. */
  subtotal: number;
  /** The discount code applied, or null if none. */
  discountCode: string | null;
  /** Absolute amount taken off the subtotal by the discount. */
  discountAmount: number;
  /** subtotal - discountAmount. */
  total: number;
  /** 1-based position of this order in the store's order history. */
  orderNumber: number;
  createdAt: string;
}

export interface DiscountCode {
  code: string;
  /** Percentage off the subtotal, e.g. 10 for 10%. */
  percentOff: number;
  used: boolean;
  /** The order count at which this coupon was earned (an nth-order milestone). */
  earnedAtOrderCount: number;
  createdAt: string;
  /** Set when the code is redeemed at checkout. */
  usedAt?: string;
  orderId?: string;
}

/** Result of validating a discount code without redeeming it. */
export interface DiscountValidation {
  valid: boolean;
  /** Present when valid: the percentage that would be applied. */
  percentOff?: number;
  /** Present when invalid: a human-readable reason. */
  reason?: string;
}

/** Aggregated numbers for the admin stats endpoint. */
export interface StoreStats {
  totalOrders: number;
  itemsPurchased: number;
  totalRevenue: number;
  totalDiscountGiven: number;
  discountCodes: DiscountCode[];
}
