import type { Role } from "@prisma/client";

// Cashier and Kitchen were retired when the store moved to its own POS — the
// system is inventory-only now. Their enum values stay in the DB (existing rows,
// easy revert), but they are no longer offered anywhere staff-facing.
export const ROLES: Role[] = [
  "ADMIN",
  "OWNER",
  "SUPERVISOR",
];

/**
 * How many ACTIVE accounts each role may have, so the system matches the real
 * store: one owner, one supervisor, a handful of admins.
 */
export const ROLE_LIMITS: Partial<Record<Role, number>> = {
  OWNER: 1,
  SUPERVISOR: 1,
  ADMIN: 5,
};

/**
 * The single sign-in screen. There is no role in the URL and none in the form:
 * everyone signs in here and the account's own role decides where they land.
 */
export const LOGIN_PATH = "/staff";

/**
 * The old per-role sign-in URLs. They are redirect stubs now (they send you to
 * LOGIN_PATH), kept so bookmarks and printed links still work.
 */
export const OLD_LOGIN_PATHS = ["/supervisor", "/admin", "/owner"];

/**
 * Whether an account's role may sign in at all. With one shared form there is no
 * per-screen role check left, so this is what keeps a retired role (cashier,
 * kitchen) out if such an account is ever restored.
 */
export function canSignIn(role: Role) {
  return ROLES.includes(role);
}

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/staff/admin",
  OWNER: "/staff/owner",
  SUPERVISOR: "/staff/supervisor",
  CASHIER: "/staff/cashier",
  KITCHEN: "/staff/kitchen",
};

/**
 * What each role is allowed to do. Read access follows the sidebar; write
 * access is deliberately narrower — e.g. a supervisor can see users but only
 * an admin or the owner can create or archive them.
 */
export const CAN: Record<string, Role[]> = {
  viewUsers: ["ADMIN", "OWNER", "SUPERVISOR"],
  manageUsers: ["ADMIN", "OWNER"],
  // The client asked for the Menu page back on Admin, fully editable — so all
  // three manage it now and Admin is no longer accounts-only.
  viewMenu: ["ADMIN", "OWNER", "SUPERVISOR"],
  manageMenu: ["ADMIN", "OWNER", "SUPERVISOR"],
  // All three roles now run inventory — every mutation (edit stock, wastage,
  // mark-expired, recipes, sales-import, stock counts) is open to any of them.
  // The Owner used to be read-only oversight and Admin read-only again after
  // that; the client dropped both restrictions (2026-08-10, Admin last), so the
  // roles differ by which pages they carry rather than by what they may change:
  // Suppliers and Activity stay Owner-only, Access Review and Menu Health stay
  // Admin-only, and Menu Availability sits with Supervisor and Owner. Reports &
  // Analytics moved off Admin on 2026-08-10 and back on 2026-08-12, so all three
  // carry it again.
  viewInventory: ["ADMIN", "SUPERVISOR", "OWNER"],
  manageInventory: ["ADMIN", "SUPERVISOR", "OWNER"],
  viewReports: ["ADMIN", "OWNER", "SUPERVISOR"],
  viewTransactions: ["ADMIN", "OWNER", "SUPERVISOR", "CASHIER"],
  manageOrders: ["CASHIER", "SUPERVISOR", "OWNER"],
  advanceOrders: ["KITCHEN", "SUPERVISOR", "OWNER"],
};

export function can(role: Role | undefined, action: keyof typeof CAN | string) {
  if (!role) return false;
  return (CAN[action] ?? []).includes(role);
}

/** Roles allowed to open a given /staff path. */
export function canAccessPath(role: Role, pathname: string) {
  const home = HOME_BY_ROLE[role];
  // Every role is confined to its own /staff/<role> subtree (kitchen included).
  return pathname.startsWith(home);
}
