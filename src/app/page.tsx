"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cart, Order, Product } from "@/lib/types";

/** Money formatter for the UI. */
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Storefront: lists products, manages a cart, and checks out (optionally with a
 * discount code). The cart is identified by an id we persist in localStorage so
 * the same browser keeps its cart across reloads.
 */
export default function StorePage() {
  const [cartId, setCartId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve a stable cart id for this browser.
  useEffect(() => {
    let id = localStorage.getItem("cartId");
    if (!id) {
      id = `cart-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("cartId", id);
    }
    setCartId(id);
  }, []);

  // Load catalogue once.
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products))
      .catch(() => setError("Failed to load products"));
  }, []);

  // Load cart whenever the id is known.
  useEffect(() => {
    if (cartId) void refreshCart(cartId);
  }, [cartId]);

  async function refreshCart(id: string) {
    const res = await fetch(`/api/cart?cartId=${encodeURIComponent(id)}`);
    const data = await res.json();
    setCart(data.cart);
    setSubtotal(data.subtotal);
  }

  const productsById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  async function addToCart(productId: string) {
    setError(null);
    setOrder(null);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, productId, quantity: 1 }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCart(data.cart);
    setSubtotal(data.subtotal);
  }

  async function setQuantity(productId: string, quantity: number) {
    const res = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, productId, quantity }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCart(data.cart);
    setSubtotal(data.subtotal);
  }

  async function validateCode() {
    if (!code.trim()) return setCodeMsg(null);
    const res = await fetch(`/api/discount/validate?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    setCodeMsg(
      data.valid
        ? { ok: true, text: `Valid — ${data.percentOff}% off` }
        : { ok: false, text: data.reason }
    );
  }

  async function checkout() {
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, discountCode: code.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setOrder(data.order);
    setCode("");
    setCodeMsg(null);
    await refreshCart(cartId);
  }

  const itemCount = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  return (
    <div className="grid">
      <section>
        <h1>Products</h1>
        {products.map((p) => (
          <div className="product" key={p.id}>
            <div>
              <div className="name">{p.name}</div>
              <div className="price">{money(p.price)}</div>
            </div>
            <button onClick={() => addToCart(p.id)}>Add to cart</button>
          </div>
        ))}
      </section>

      <aside>
        <div className="card">
          <h2>Your Cart ({itemCount})</h2>
          {!cart || cart.items.length === 0 ? (
            <p className="muted">Cart is empty. Add something!</p>
          ) : (
            <>
              {cart.items.map((item) => {
                const p = productsById[item.productId];
                return (
                  <div className="row" key={item.productId}>
                    <div>
                      <div>{p?.name ?? item.productId}</div>
                      <div className="muted">{money(p?.price ?? 0)} each</div>
                    </div>
                    <div className="qty">
                      <button
                        onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => setQuantity(item.productId, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="totals" style={{ marginTop: 12 }}>
                <div className="row grand">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <input
                  placeholder="Discount code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onBlur={validateCode}
                />
                {codeMsg && (
                  <div className={`notice ${codeMsg.ok ? "ok" : "err"}`}>
                    {codeMsg.text}
                  </div>
                )}
              </div>

              <button
                className="success"
                style={{ width: "100%", marginTop: 12 }}
                onClick={checkout}
              >
                Checkout
              </button>
            </>
          )}

          {error && <div className="notice err">{error}</div>}
        </div>

        {order && (
          <div className="card">
            <h2>✅ Order placed</h2>
            <div className="muted">
              Order {order.id} (#{order.orderNumber})
            </div>
            <div className="row">
              <span>Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="row" style={{ color: "var(--accent-2)" }}>
                <span>Discount ({order.discountCode})</span>
                <span>−{money(order.discountAmount)}</span>
              </div>
            )}
            <div className="row grand">
              <span>Total paid</span>
              <span>{money(order.total)}</span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
