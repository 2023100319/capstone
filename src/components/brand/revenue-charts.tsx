"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ReportPoint } from "@/types/reports";

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 };

const peso = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Money in against money out, over the dashboard's period. */
export function RevenueVsExpensesChart({ series }: { series: ReportPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v) => peso(Number(v ?? 0))}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(30, 75, 158, 0.05)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The shape of sales across the same period. */
export function RevenueTrendChart({ series }: { series: ReportPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => peso(Number(v ?? 0))} contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#1e4b9e"
          strokeWidth={2}
          dot={{ fill: "#1e4b9e", r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
