"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };

/** Vertical bar chart of the best-selling menu items (by paid orders). */
export function TopSellingChart({ items }: { items: { name: string; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={items} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="name"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval={0}
          tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          formatter={(v) => [`${v} sold`, "Orders"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
          cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
        />
        <Bar dataKey="orders" name="Orders" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={64} />
      </BarChart>
    </ResponsiveContainer>
  );
}
