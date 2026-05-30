import { describe, expect, it } from "vitest";
import { calcDiscountAmount, calcSubtotal, roundMoney } from "./pricing";

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10.0);
  });

  it("avoids classic floating-point drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("calcSubtotal", () => {
  it("sums price * quantity across lines", () => {
    const subtotal = calcSubtotal([
      { price: 25, quantity: 2 },
      { price: 75.5, quantity: 1 },
    ]);
    expect(subtotal).toBe(125.5);
  });

  it("is zero for an empty cart", () => {
    expect(calcSubtotal([])).toBe(0);
  });
});

describe("calcDiscountAmount", () => {
  it("computes a percentage of the subtotal", () => {
    expect(calcDiscountAmount(200, 10)).toBe(20);
    expect(calcDiscountAmount(125.5, 10)).toBe(12.55);
  });

  it("clamps percentage to the [0, 100] range", () => {
    expect(calcDiscountAmount(100, 150)).toBe(100);
    expect(calcDiscountAmount(100, -10)).toBe(0);
  });
});
