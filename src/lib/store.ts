/**
 * In-memory store and business logic.
 *
 * `Store` is a plain class with no I/O so it can be instantiated fresh in unit
 * tests. The application uses a single shared instance (see `getStore` below).
 * State lives in Maps/arrays and is lost on process restart, which the BRD
 * explicitly allows.
 */
import { CONFIG } from "./config";
import { calcDiscountAmount, calcSubtotal, roundMoney } from "./pricing";
import type {
  Cart,
  CartItem,
  DiscountCode,
  DiscountValidation,
  Order,
  OrderItem,
  Product,
  StoreStats,
} from "./types";

/** Raised for expected, client-correctable problems; routes map these to 400. */
export class StoreError extends Error {
  /**
   * Stable brand used to recognise this error across module boundaries. Next.js
   * bundles each route handler separately, so a plain `instanceof StoreError`
   * can fail when the error originates from the shared singleton (constructed in
   * one bundle) but is inspected in another. See `isStoreError`.
   */
  readonly isStoreError = true;

  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

/** Bundle-safe check for a StoreError (see the note on `StoreError.isStoreError`). */
export function isStoreError(err: unknown): err is StoreError {
  return (
    err instanceof StoreError ||
    (typeof err === "object" && err !== null && (err as StoreError).isStoreError === true)
  );
}

const SEED_PRODUCTS: Product[] = [
  { id: "p1", name: "Wireless Mouse", price: 25.0 },
  { id: "p2", name: "Mechanical Keyboard", price: 75.5 },
  { id: "p3", name: "27\" Monitor", price: 320.0 },
  { id: "p4", name: "USB-C Hub", price: 45.99 },
  { id: "p5", name: "Laptop Stand", price: 39.0 },
];

let codeCounter = 0;
let orderCounter = 0;

export class Store {
  private products = new Map<string, Product>();
  private carts = new Map<string, Cart>();
  private orders: Order[] = [];
  private discountCodes = new Map<string, DiscountCode>();

  /**
   * The highest order-count milestone for which a coupon has already been
   * generated. Prevents the admin endpoint from minting two coupons for the
   * same milestone.
   */
  private lastEarnedMilestone = 0;

  constructor() {
    for (const p of SEED_PRODUCTS) this.products.set(p.id, { ...p });
  }

  // ---- Products -----------------------------------------------------------

  getProducts(): Product[] {
    return [...this.products.values()];
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  // ---- Cart ---------------------------------------------------------------

  /** Returns the cart for `cartId`, creating an empty one on first access. */
  getCart(cartId: string): Cart {
    let cart = this.carts.get(cartId);
    if (!cart) {
      cart = { id: cartId, items: [] };
      this.carts.set(cartId, cart);
    }
    return cart;
  }

  /**
   * Adds `quantity` of a product to the cart. Quantities for an existing line
   * accumulate. Validates the product exists and the quantity is positive.
   */
  addToCart(cartId: string, productId: string, quantity: number): Cart {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new StoreError("quantity must be a positive integer");
    }
    if (!this.products.has(productId)) {
      throw new StoreError(`unknown product: ${productId}`);
    }
    const cart = this.getCart(cartId);
    const existing = cart.items.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({ productId, quantity });
    }
    return cart;
  }

  /** Sets the absolute quantity for a line, or removes it when quantity is 0. */
  setCartItemQuantity(cartId: string, productId: string, quantity: number): Cart {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new StoreError("quantity must be a non-negative integer");
    }
    const cart = this.getCart(cartId);
    const idx = cart.items.findIndex((i) => i.productId === productId);
    if (idx === -1) throw new StoreError(`product not in cart: ${productId}`);
    if (quantity === 0) {
      cart.items.splice(idx, 1);
    } else {
      cart.items[idx].quantity = quantity;
    }
    return cart;
  }

  clearCart(cartId: string): void {
    this.carts.delete(cartId);
  }

  /** Resolves cart lines into priced order-item snapshots. */
  private resolveLines(items: CartItem[]): OrderItem[] {
    return items.map((item) => {
      const product = this.products.get(item.productId);
      if (!product) throw new StoreError(`unknown product: ${item.productId}`);
      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      };
    });
  }

  // ---- Discount codes -----------------------------------------------------

  /**
   * Validates a code without redeeming it. A code is valid if it exists and has
   * not already been used.
   */
  validateDiscount(code: string): DiscountValidation {
    const entry = this.discountCodes.get(code);
    if (!entry) return { valid: false, reason: "discount code does not exist" };
    if (entry.used) return { valid: false, reason: "discount code already used" };
    return { valid: true, percentOff: entry.percentOff };
  }

  getDiscountCodes(): DiscountCode[] {
    return [...this.discountCodes.values()];
  }

  /**
   * Admin action: mint a coupon if the store is currently at an nth-order
   * milestone that has not yet been claimed.
   *
   * Eligible when `orderCount > 0`, `orderCount % nthOrder === 0`, and the
   * milestone is newer than the last one we issued a coupon for.
   */
  generateDiscountCode(): DiscountCode {
    const orderCount = this.orders.length;
    const atMilestone = orderCount > 0 && orderCount % CONFIG.nthOrder === 0;
    if (!atMilestone) {
      throw new StoreError(
        `not eligible: a coupon is earned every ${CONFIG.nthOrder} orders (current order count: ${orderCount})`
      );
    }
    if (orderCount <= this.lastEarnedMilestone) {
      throw new StoreError(
        `coupon for the milestone at order ${orderCount} has already been generated`
      );
    }

    const code: DiscountCode = {
      code: `SAVE${CONFIG.discountPercent}-${++codeCounter}`,
      percentOff: CONFIG.discountPercent,
      used: false,
      earnedAtOrderCount: orderCount,
      createdAt: new Date().toISOString(),
    };
    this.discountCodes.set(code.code, code);
    this.lastEarnedMilestone = orderCount;
    return code;
  }

  // ---- Checkout -----------------------------------------------------------

  /**
   * Converts the cart into an order, optionally applying a discount code.
   *
   * The discount is validated first; an invalid code rejects the whole checkout
   * so the customer is never silently charged full price after entering a code.
   * On success the code is marked used (single-use) and the cart is emptied.
   */
  checkout(cartId: string, discountCodeInput?: string | null): Order {
    const cart = this.getCart(cartId);
    if (cart.items.length === 0) throw new StoreError("cart is empty");

    const lines = this.resolveLines(cart.items);
    const subtotal = calcSubtotal(lines);

    let discountAmount = 0;
    let appliedCode: DiscountCode | null = null;
    const code = discountCodeInput?.trim();

    if (code) {
      const validation = this.validateDiscount(code);
      if (!validation.valid) throw new StoreError(validation.reason!);
      appliedCode = this.discountCodes.get(code)!;
      discountAmount = calcDiscountAmount(subtotal, appliedCode.percentOff);
    }

    const total = roundMoney(subtotal - discountAmount);
    const order: Order = {
      id: `ord-${++orderCounter}`,
      items: lines,
      subtotal,
      discountCode: appliedCode?.code ?? null,
      discountAmount,
      total,
      orderNumber: this.orders.length + 1,
      createdAt: new Date().toISOString(),
    };

    // Commit: record the order, redeem the code, empty the cart.
    this.orders.push(order);
    if (appliedCode) {
      appliedCode.used = true;
      appliedCode.usedAt = order.createdAt;
      appliedCode.orderId = order.id;
    }
    this.clearCart(cartId);
    return order;
  }

  // ---- Admin stats --------------------------------------------------------

  getOrders(): Order[] {
    return [...this.orders];
  }

  getStats(): StoreStats {
    const itemsPurchased = this.orders.reduce(
      (sum, o) => sum + o.items.reduce((n, i) => n + i.quantity, 0),
      0
    );
    const totalRevenue = roundMoney(
      this.orders.reduce((sum, o) => sum + o.total, 0)
    );
    const totalDiscountGiven = roundMoney(
      this.orders.reduce((sum, o) => sum + o.discountAmount, 0)
    );
    return {
      totalOrders: this.orders.length,
      itemsPurchased,
      totalRevenue,
      totalDiscountGiven,
      discountCodes: this.getDiscountCodes(),
    };
  }
}

/**
 * Shared singleton for the running app. Cached on `globalThis` so it survives
 * Next.js dev hot-reloads (which re-evaluate modules) and is shared across all
 * route handlers in the same process. Tests instantiate `new Store()` directly
 * and never touch this.
 */
const globalForStore = globalThis as unknown as { __ecommStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__ecommStore) {
    globalForStore.__ecommStore = new Store();
  }
  return globalForStore.__ecommStore;
}
