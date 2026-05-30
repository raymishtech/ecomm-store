"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiscountCode, StoreStats } from "@/lib/types";

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Admin dashboard: shows store stats and lets an operator try to generate a
 * coupon. Generation only succeeds when the store is at an nth-order milestone,
 * mirroring the admin API contract.
 */
export default function AdminPage() {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    setStats(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate() {
    const res = await fetch("/api/admin/discount", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ ok: false, text: data.error });
    } else {
      const code = data.discountCode as DiscountCode;
      setMsg({ ok: true, text: `Generated ${code.code} (${code.percentOff}% off)` });
      await refresh();
    }
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>

      <div className="card">
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{stats?.totalOrders ?? 0}</div>
            <div className="label">Orders</div>
          </div>
          <div className="stat">
            <div className="value">{stats?.itemsPurchased ?? 0}</div>
            <div className="label">Items purchased</div>
          </div>
          <div className="stat">
            <div className="value">{money(stats?.totalRevenue ?? 0)}</div>
            <div className="label">Revenue</div>
          </div>
          <div className="stat">
            <div className="value">{money(stats?.totalDiscountGiven ?? 0)}</div>
            <div className="label">Discounts given</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Discount codes</h2>
        <p className="muted">
          A coupon is earned every nth order. Click generate when a milestone is
          reached.
        </p>
        <div style={{ display: "flex", gap: 10, margin: "10px 0" }}>
          <button onClick={generate}>Generate discount code</button>
          <button className="secondary" onClick={refresh}>
            Refresh
          </button>
        </div>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        {stats && stats.discountCodes.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>% off</th>
                <th>Earned at order</th>
                <th>Status</th>
                <th>Used on</th>
              </tr>
            </thead>
            <tbody>
              {stats.discountCodes.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.percentOff}%</td>
                  <td>#{c.earnedAtOrderCount}</td>
                  <td>
                    <span className={`badge ${c.used ? "used" : "active"}`}>
                      {c.used ? "used" : "active"}
                    </span>
                  </td>
                  <td className="muted">{c.orderId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No discount codes generated yet.</p>
        )}
      </div>
    </div>
  );
}
