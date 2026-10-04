"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { ROLES, ROLE_LIMITS } from "@/lib/roles";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULES } from "@/lib/password";
import { logActivity } from "@/lib/activity";
import type { Role } from "@prisma/client";

// Own message: the default reads "Invalid option: expected one of ..." , which
// is the raw enum rather than anything a staff member can act on.
const roleEnum = z.enum(ROLES as [string, ...string[]], {
  error: "Pick a role from the list.",
});

/**
 * Built from the shared rule list, so the checklist in the form and what the
 * server accepts are literally the same rules. (This file is "use server" —
 * everything exported from it must be an async action, hence no export here.)
 */
const passwordSchema = PASSWORD_RULES.reduce(
  (schema, rule) => schema.regex(rule.pattern, rule.error),
  z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`)
);

/**
 * Employee numbers are typed in by hand — the store issues them, not this app —
 * so the only rules are the ones the database needs: unique, and printable.
 */
const employeeIdSchema = z
  .string()
  .trim()
  .min(2, "Employee ID must be at least 2 characters.")
  .max(20, "Employee ID must be 20 characters or fewer.")
  .regex(/^[a-zA-Z0-9-]+$/, "Employee ID may only use letters, numbers and dashes.");

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may only use letters, numbers, . _ -");

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80),
  employeeId: employeeIdSchema,
  username: usernameSchema,
  password: passwordSchema,
  role: roleEnum,
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  employeeId: employeeIdSchema,
  username: usernameSchema,
  role: roleEnum,
  // Blank means "leave the password alone".
  password: z.union([passwordSchema, z.literal("")]).optional(),
});

function revalidateUserViews() {
  for (const role of ["admin", "supervisor", "owner"]) {
    revalidatePath(`/staff/${role}/users`);
  }
}

function fail(error: string) {
  return { success: false as const, error };
}

const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

/**
 * Both employeeId and username are UNIQUE columns. The actions below check for
 * a clash first so the staff member gets a sentence they can act on, but a
 * second admin saving at the same moment would still slip past that check —
 * this turns the resulting constraint error into the same message.
 */
function duplicateFieldMessage(e: unknown) {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return null;

  const target = JSON.stringify(err.meta?.target ?? "");
  if (target.includes("employeeId")) return "That Employee ID is already in use.";
  if (target.includes("username")) return "That username is already taken.";
  return "Another account already uses those details.";
}

/**
 * A suggestion only — employee numbers are typed in by hand. Derived from the
 * highest EMP-#### on file rather than a row count, so archiving or deleting a
 * user can never suggest a number that already exists. Anything that does not
 * follow the EMP- pattern is ignored, since it cannot be counted from.
 */
async function nextEmployeeId() {
  const latest = await prisma.user.findFirst({
    where: { employeeId: { startsWith: "EMP-" } },
    orderBy: { employeeId: "desc" },
    select: { employeeId: true },
  });

  const current = Number(latest?.employeeId.slice(4)) || 0;
  return `EMP-${String(current + 1).padStart(4, "0")}`;
}

/**
 * Rejects a role that is already fully staffed. `excludeUserId` keeps an edit
 * from tripping over the very user being edited.
 */
async function checkRoleCapacity(role: string, excludeUserId?: string) {
  const limit = ROLE_LIMITS[role as Role];
  if (limit === undefined) return null;

  const taken = await prisma.user.count({
    where: {
      role: role as never,
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });

  if (taken >= limit) {
    return `Only ${limit} ${roleLabel(role)} account${limit === 1 ? "" : "s"} allowed — ${taken} already in use.`;
  }
  return null;
}

export async function getUsers(includeArchived = false) {
  return prisma.user.findMany({
    where: includeArchived ? { status: "ARCHIVED" } : { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      employeeId: true,
      username: true,
      role: true,
      status: true,
      lastActive: true,
    },
  });
}

/** ACTIVE headcount per role, so the form can show "1 / 1 used" up front. */
export async function getRoleUsage() {
  const grouped = await prisma.user.groupBy({
    by: ["role"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });

  const usage: Record<string, { used: number; limit: number | null }> = {};
  for (const role of ROLES) {
    usage[role] = {
      used: grouped.find((g) => g.role === role)?._count._all ?? 0,
      limit: ROLE_LIMITS[role] ?? null,
    };
  }
  return usage;
}

/** Offered as the placeholder on Add User, so the usual case is one keystroke. */
export async function suggestEmployeeId() {
  return nextEmployeeId();
}

export async function createUser(input: unknown) {
  try {
    const actor = await requireCan("manageUsers");

    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { name, employeeId, username, password, role } = parsed.data;

    // One lookup covers both unique columns, so the admin is told which of the
    // two they need to change rather than fixing one and tripping on the other.
    const taken = await prisma.user.findFirst({
      where: { OR: [{ username }, { employeeId }] },
      select: { employeeId: true },
    });
    if (taken) {
      return fail(
        taken.employeeId.toLowerCase() === employeeId.toLowerCase()
          ? "That Employee ID is already in use."
          : "That username is already taken."
      );
    }

    const overCapacity = await checkRoleCapacity(role);
    if (overCapacity) return fail(overCapacity);

    const created = await prisma.user.create({
      data: {
        name,
        employeeId,
        username,
        password: await bcrypt.hash(password, 10),
        role: role as never,
      },
    });

    await logActivity({
      actor,
      area: "USERS",
      action: "CREATE",
      targetName: created.name,
      targetId: created.id,
      detail: `${roleLabel(role)} · ${created.employeeId} · @${created.username}`,
    });

    revalidateUserViews();
    return { success: true as const };
  } catch (e) {
    return fail(
      duplicateFieldMessage(e) ??
        (e instanceof Error ? e.message : "Failed to create the user.")
    );
  }
}

export async function updateUser(input: unknown) {
  try {
    const actor = await requireCan("manageUsers");

    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { id, name, employeeId, username, role, password } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { name: true, employeeId: true, username: true, role: true },
    });
    if (!target) return fail("User not found.");

    // Only the owner changes the owner's password (client request, 2026-09-13).
    // Details like the name still go through for admins; the password itself is
    // off-limits to anyone whose actor role is not OWNER.
    if (target.role === "OWNER" && password && actor.role !== "OWNER") {
      return fail("Only the owner can change the owner password.");
    }

    // Same clash check as createUser, minus this account — otherwise saving a
    // form with an unchanged username would report it as taken by itself.
    const taken = await prisma.user.findFirst({
      where: { id: { not: id }, OR: [{ username }, { employeeId }] },
      select: { employeeId: true },
    });
    if (taken) {
      return fail(
        taken.employeeId.toLowerCase() === employeeId.toLowerCase()
          ? "That Employee ID is already in use."
          : "That username is already taken."
      );
    }

    // Promoting someone must respect the same headcount as creating them.
    if (target.role !== role) {
      const overCapacity = await checkRoleCapacity(role, id);
      if (overCapacity) return fail(overCapacity);
    }

    await prisma.user.update({
      where: { id },
      data: {
        name,
        employeeId,
        username,
        role: role as never,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
    });

    const changes: string[] = [];
    if (target.name !== name) changes.push(`${target.name} → ${name}`);
    if (target.employeeId !== employeeId) changes.push(`${target.employeeId} → ${employeeId}`);
    if (target.username !== username) changes.push(`@${target.username} → @${username}`);
    if (target.role !== role) changes.push(`${roleLabel(target.role)} → ${roleLabel(role)}`);
    if (password) changes.push("Password reset");

    await logActivity({
      actor,
      area: "USERS",
      action: "UPDATE",
      targetName: name,
      targetId: id,
      detail: changes.length > 0 ? changes.join(" · ") : "Details updated",
    });

    revalidateUserViews();
    return { success: true as const };
  } catch (e) {
    return fail(
      duplicateFieldMessage(e) ??
        (e instanceof Error ? e.message : "Failed to update the user.")
    );
  }
}

/**
 * Permanently removes an account. Refused for anyone who has rung up a sale:
 * Transaction.cashierId is a required foreign key, so the delete would either be
 * rejected by the database or take the sales history with it. Archiving is the
 * answer for those — the account stops working, the receipts stay.
 */
export async function deleteUser(id: string) {
  try {
    const actor = await requireCan("manageUsers");
    if (actor.id === id) return fail("You cannot delete your own account.");

    const target = await prisma.user.findUnique({
      where: { id },
      select: { name: true, role: true },
    });
    if (!target) return fail("User not found.");

    if (target.role === "OWNER") return fail("The owner account cannot be deleted.");

    const sales = await prisma.transaction.count({ where: { cashierId: id } });
    if (sales > 0) {
      return fail(
        `${target.name} has ${sales} recorded transaction${sales === 1 ? "" : "s"}. ` +
          "Archive the account instead so the sales history stays intact."
      );
    }

    // Their inventory edits and stock deliveries stay on file — those foreign
    // keys are ON DELETE SET NULL, so the rows survive without an author.
    await prisma.user.delete({ where: { id } });

    await logActivity({
      actor,
      area: "USERS",
      action: "DELETE",
      targetName: target.name,
      targetId: id,
      detail: `${roleLabel(target.role)} account deleted`,
    });

    revalidateUserViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to delete the user.");
  }
}

export async function setUserArchived(id: string, archived: boolean) {
  try {
    const actor = await requireCan("manageUsers");
    if (actor.id === id && archived) {
      return fail("You cannot archive your own account.");
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { name: true, role: true },
    });
    if (!target) return fail("User not found.");

    // The owner is the one account that must always exist — archiving it would
    // leave the business with no one who can restore anything.
    if (target.role === "OWNER" && archived) {
      return fail("The owner account cannot be archived.");
    }

    // Restoring has to fit under the cap too, or archiving then restoring would
    // be a way around it.
    if (!archived) {
      const overCapacity = await checkRoleCapacity(target.role, id);
      if (overCapacity) return fail(overCapacity);
    }

    await prisma.user.update({
      where: { id },
      data: { status: archived ? "ARCHIVED" : "ACTIVE" },
    });

    await logActivity({
      actor,
      area: "USERS",
      action: archived ? "ARCHIVE" : "RESTORE",
      targetName: target.name,
      targetId: id,
      detail: `${roleLabel(target.role)} account ${archived ? "archived" : "restored"}`,
    });

    revalidateUserViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the user.");
  }
}
