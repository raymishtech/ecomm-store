import { beforeEach, describe, expect, it } from "vitest";
import { Store, StoreError } from "./store";
import { CONFIG } from "./config";

/**
 * Tests use the default config (nthOrder = 3, discountPercent = 10). A fresh
 * Store is created per test so state never leaks between cases.
 */
let store: Store;

/** Adds one of product p1 to a cart and checks it out, returning the order. */
function placeSimpleOrder(cartId: string, discountCode?: string) {
  store.addToCart(cartId, "p1", 1); // p1 = Wireless Mouse, $25
  return store.checkout(cartId, discountCode);
}

beforeEach(() => {
  store = new Store();
});

describe("catalogue", () => {
  it("seeds products", () => {
    expect(store.getProducts().length).toBeGreaterThan(0);
    expect(store.getProduct("p1")?.name).toBe("Wireless Mouse");
  });
});

describe("cart", () => {
  it("creates an empty cart on first access", () => {
    expect(store.getCart("c1").items).toEqual([]);
  });

  it("accumulates quantity when the same product is added twice", () => {
    store.addToCart("c1", "p1", 1);
    store.addToCart("c1", "p1", 2);
    expect(store.getCart("c1").items).toEqual([{ productId: "p1", quantity: 3 }]);
  });

  it("rejects unknown products and bad quantities", () => {
    expect(() => store.addToCart("c1", "nope", 1)).toThrow(StoreError);
    expect(() => store.addToCart("c1", "p1", 0)).toThrow(StoreError);
    expect(() => store.addToCart("c1", "p1", 1.5)).toThrow(StoreError);
  });

  it("updates and removes line items by absolute quantity", () => {
    store.addToCart("c1", "p1", 5);
    store.setCartItemQuantity("c1", "p1", 2);
    expect(store.getCart("c1").items[0].quantity).toBe(2);
    store.setCartItemQuantity("c1", "p1", 0);
    expect(store.getCart("c1").items).toEqual([]);
  });
});

describe("checkout", () => {
  it("rejects an empty cart", () => {
    expect(() => store.checkout("c1")).toThrow(StoreError);
  });

  it("computes the subtotal and empties the cart", () => {
    store.addToCart("c1", "p1", 2); // 2 * 25 = 50
    store.addToCart("c1", "p2", 1); // 1 * 75.5
    const order = store.checkout("c1");
    expect(order.subtotal).toBe(125.5);
    expect(order.total).toBe(125.5);
    expect(order.discountAmount).toBe(0);
    expect(store.getCart("c1").items).toEqual([]); // cleared
  });

  it("snapshots item name and price onto the order", () => {
    const order = placeSimpleOrder("c1");
    expect(order.items[0]).toMatchObject({ name: "Wireless Mouse", price: 25 });
  });

  it("rejects an invalid discount code", () => {
    store.addToCart("c1", "p1", 1);
    expect(() => store.checkout("c1", "BOGUS")).toThrow(/does not exist/);
  });
});

describe("discount generation (nth order)", () => {
  it("is not eligible before the first milestone", () => {
    expect(() => store.generateDiscountCode()).toThrow(/not eligible/);
    placeSimpleOrder("c1");
    placeSimpleOrder("c2"); // 2 orders, milestone is 3
    expect(() => store.generateDiscountCode()).toThrow(/not eligible/);
  });

  it("mints a coupon exactly at the nth order", () => {
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`c${i}`);
    const code = store.generateDiscountCode();
    expect(code.percentOff).toBe(CONFIG.discountPercent);
    expect(code.earnedAtOrderCount).toBe(CONFIG.nthOrder);
    expect(code.used).toBe(false);
  });

  it("does not mint two coupons for the same milestone", () => {
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`c${i}`);
    store.generateDiscountCode();
    expect(() => store.generateDiscountCode()).toThrow(/already been generated/);
  });

  it("mints a fresh coupon at the next milestone", () => {
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`a${i}`);
    const first = store.generateDiscountCode();
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`b${i}`);
    const second = store.generateDiscountCode();
    expect(second.code).not.toBe(first.code);
    expect(second.earnedAtOrderCount).toBe(CONFIG.nthOrder * 2);
  });
});

describe("redeeming a discount code", () => {
  function earnCoupon() {
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`seed${i}`);
    return store.generateDiscountCode();
  }

  it("applies the percentage and marks the code used", () => {
    const coupon = earnCoupon();
    store.addToCart("buyer", "p3", 1); // $320
    const order = store.checkout("buyer", coupon.code);
    expect(order.subtotal).toBe(320);
    expect(order.discountAmount).toBe(32); // 10%
    expect(order.total).toBe(288);
    expect(order.discountCode).toBe(coupon.code);
    expect(store.validateDiscount(coupon.code).valid).toBe(false);
  });

  it("rejects reuse of a spent code", () => {
    const coupon = earnCoupon();
    placeSimpleOrder("first", coupon.code);
    store.addToCart("second", "p1", 1);
    expect(() => store.checkout("second", coupon.code)).toThrow(/already used/);
  });
});

describe("stats", () => {
  it("aggregates orders, items, revenue and discounts", () => {
    store.addToCart("c1", "p1", 2); // 50
    store.checkout("c1");
    store.addToCart("c2", "p2", 1); // 75.5
    store.checkout("c2");
    const stats = store.getStats();
    expect(stats.totalOrders).toBe(2);
    expect(stats.itemsPurchased).toBe(3);
    expect(stats.totalRevenue).toBe(125.5);
    expect(stats.totalDiscountGiven).toBe(0);
  });

  it("counts discount given when a coupon is redeemed", () => {
    for (let i = 0; i < CONFIG.nthOrder; i++) placeSimpleOrder(`s${i}`);
    const coupon = store.generateDiscountCode();
    store.addToCart("buyer", "p3", 1); // 320, 10% off => 32
    store.checkout("buyer", coupon.code);
    expect(store.getStats().totalDiscountGiven).toBe(32);
  });
});
