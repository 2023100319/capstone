import { getUsers, getRoleUsage, suggestEmployeeId } from "@/app/actions/users";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import { UsersManager } from "./users-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const [users, actor, roleUsage, suggestedEmployeeId] = await Promise.all([
    getUsers(showArchived),
    currentUser(),
    getRoleUsage(),
    suggestEmployeeId(),
  ]);

  return (
    <UsersManager
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        employeeId: u.employeeId,
        username: u.username,
        role: u.role,
        status: u.status,
        lastActive: u.lastActive.toISOString(),
      }))}
      showArchived={showArchived}
      canManage={can(actor?.role, "manageUsers")}
      // Only the owner can change the owner's password — the server enforces
      // it; this prop keeps the field out of an admin's edit dialog too.
      isOwnerActor={actor?.role === "OWNER"}
      roleUsage={roleUsage}
      suggestedEmployeeId={suggestedEmployeeId}
    />
  );
}
