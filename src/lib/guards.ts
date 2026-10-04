import { getServerSession } from "next-auth";
import type { Role } from "@prisma/client";
import { authOptions } from "./auth";
import { can } from "./roles";

export type SessionUser = { id: string; name?: string | null; role: Role };

/** The signed-in staff member, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role as Role,
  };
}

/**
 * Guard for mutating server actions. Never trust a role or user id sent from
 * the client — always re-derive it from the session here.
 */
export async function requireCan(action: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("You are not signed in.");
  if (!can(user.role, action)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}
