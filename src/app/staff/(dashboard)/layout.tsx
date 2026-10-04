"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, BookOpen,
  Archive, LogOut, LayoutGrid, Menu, X, ClipboardCheck, UserCog,
  BarChart3, UtensilsCrossed, Truck,
  // Activity icon kept for the commented-out nav below.
  // Activity,
  // Sales/POS icons kept for the commented-out nav below — the client moved to
  // their own POS, so Transactions, Reports and the Order/Payment flow are
  // hidden (not deleted). Uncomment their links + these icons to bring them back.
  // ShoppingBag, BarChart3, CreditCard, ReceiptText,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

// Inventory-only build: the Cashier role and every sales/POS link are hidden.
// Left commented so nothing is lost if the client changes their mind.
const NAV_BY_ROLE: Record<string, { label: string; href: string; icon: LucideIcon }[]> = {
  // cashier: [
  //   { label: "Dashboard", href: "/staff/cashier", icon: LayoutDashboard },
  //   { label: "Payment", href: "/staff/cashier/payment", icon: CreditCard },
  //   { label: "Order", href: "/staff/cashier/orders", icon: ShoppingBag },
  //   { label: "Transaction", href: "/staff/cashier/transactions", icon: ReceiptText },
  // ],
  supervisor: [
    { label: "Dashboard", href: "/staff/supervisor", icon: LayoutDashboard },
    // { label: "Order", href: "/staff/supervisor/orders", icon: ShoppingBag },
    { label: "Users", href: "/staff/supervisor/users", icon: Users },
    { label: "Menu", href: "/staff/supervisor/menu", icon: BookOpen },
    { label: "Inventory", href: "/staff/supervisor/inventory", icon: Archive },
    { label: "Reports & Analytics", href: "/staff/supervisor/inventory/analytics", icon: BarChart3 },
    { label: "Menu Availability", href: "/staff/supervisor/inventory/availability", icon: UtensilsCrossed },
    // { label: "Transaction", href: "/staff/supervisor/transactions", icon: ReceiptText },
    // { label: "Reports", href: "/staff/supervisor/reports", icon: BarChart3 },
  ],
  admin: [
    { label: "Dashboard", href: "/staff/admin", icon: LayoutDashboard },
    { label: "Users", href: "/staff/admin/users", icon: Users },
    { label: "Access Review", href: "/staff/admin/access-review", icon: UserCog },
    { label: "Menu", href: "/staff/admin/menu", icon: BookOpen },
    { label: "Menu Health", href: "/staff/admin/menu-health", icon: ClipboardCheck },
    // Admin runs Inventory outright (read + edit), so it gets the Supervisor
    // screen itself. Reports & Analytics moved off Admin on 2026-08-10 and came
    // back on 2026-08-12 at the client's request; Menu Availability stayed with
    // Supervisor and Owner.
    { label: "Inventory", href: "/staff/admin/inventory", icon: Archive },
    { label: "Reports & Analytics", href: "/staff/admin/inventory/analytics", icon: BarChart3 },
    // { label: "Transaction", href: "/staff/admin/transactions", icon: ReceiptText },
    // { label: "Reports", href: "/staff/admin/reports", icon: BarChart3 },
  ],
  owner: [
    { label: "Dashboard", href: "/staff/owner", icon: LayoutDashboard },
    // { label: "Order", href: "/staff/owner/orders", icon: ShoppingBag },
    { label: "Users", href: "/staff/owner/users", icon: Users },
    { label: "Menu", href: "/staff/owner/menu", icon: BookOpen },
    { label: "Inventory", href: "/staff/owner/inventory", icon: Archive },
    { label: "Reports & Analytics", href: "/staff/owner/inventory/analytics", icon: BarChart3 },
    { label: "Menu Availability", href: "/staff/owner/inventory/availability", icon: UtensilsCrossed },
    { label: "Suppliers", href: "/staff/owner/suppliers", icon: Truck },
    // Activity page hidden at the client's request (2026-09-13). The page and
    // getActivity() stay — uncomment to bring it back.
    // { label: "Activity", href: "/staff/owner/activity", icon: Activity },
    // { label: "Transaction", href: "/staff/owner/transactions", icon: ReceiptText },
    // { label: "Reports", href: "/staff/owner/reports", icon: BarChart3 },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  // Trust the session, not the URL — otherwise visiting /staff/owner would hand
  // anyone the Owner sidebar.
  const role = (session?.user?.role ?? "").toLowerCase();
  const nav = NAV_BY_ROLE[role] ?? [];
  const staffName = session?.user?.name ?? "…";

  // Off-canvas drawer state for mobile (< lg). Static sidebar on desktop.
  // Every nav link, the backdrop, and the close button reset this, so the
  // drawer never lingers over content after a navigation.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex-1 bg-background">
      {/* Backdrop (mobile only, when drawer is open) */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* Sidebar — position: fixed at every breakpoint. It used to be lg:static,
          which put it in the document flow at only 100vh tall; once a page grew
          past the viewport the whole document scrolled and the sidebar slid away
          leaving a blank column. Fixed, it cannot move no matter how tall the
          page gets. Under lg it doubles as the off-canvas drawer. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200",
          "lg:w-56 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* User info */}
        <div className="flex items-center justify-between border-b border-sidebar-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo variant="staff" size={44} className="flex-shrink-0 ring-2 ring-sidebar-primary/40" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{staffName}</p>
              <p className="text-xs capitalize text-sidebar-foreground/70">{role}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold tracking-wider uppercase text-sidebar-foreground/50">
            Management
          </p>
          {nav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive && "text-sidebar-primary"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main — padded aside for the fixed sidebar, which is out of the flow */}
      <div className="flex min-h-screen flex-col lg:pl-56">
        {/* Top bar — sticky so it stays reachable as the page scrolls */}
        <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-3 border-b border-border bg-card px-4 shadow-sm sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <LayoutGrid className="hidden h-5 w-5 text-muted-foreground sm:block" />
          <span className="font-semibold capitalize text-foreground">
            {role.charAt(0).toUpperCase() + role.slice(1)} Dashboard
          </span>
          <div className="ml-auto">
            <button
              // Back to the one sign-in screen so signing in again is one click
              // away.
              onClick={() => signOut({ callbackUrl: "/staff" })}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </header>

        {/* Page content — scrolls with the document, not in its own box */}
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
