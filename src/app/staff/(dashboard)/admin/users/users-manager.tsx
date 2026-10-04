"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Plus, Pencil, Archive, ArchiveRestore, Check, X, Eye, EyeOff } from "lucide-react";
import type { Role, UserStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { FormDialog, Field, inputClass } from "@/components/brand/form-dialog";
import { createUser, updateUser, setUserArchived } from "@/app/actions/users";
import { ROLES } from "@/lib/roles";
import { PASSWORD_MIN, PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/utils";

type StaffUser = {
  id: string;
  name: string;
  employeeId: string;
  username: string;
  role: Role;
  status: UserStatus;
  lastActive: string;
};

type RoleUsage = Record<string, { used: number; limit: number | null }>;

/** The same rules the server enforces, ticked off live as the admin types. */
function PasswordChecklist({ value }: { value: string }) {
  const checks = [
    { label: `At least ${PASSWORD_MIN} characters`, passed: value.length >= PASSWORD_MIN },
    ...PASSWORD_RULES.map((rule) => ({
      label: rule.label,
      passed: rule.pattern.test(value),
    })),
  ];

  // Plain spans, not a list — this renders inside Field's <label>.
  return (
    <span className="mt-2 block space-y-1">
      {checks.map((check) => (
        <span
          key={check.label}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            check.passed ? "text-emerald-600" : "text-muted-foreground"
          )}
        >
          {check.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {check.label}
        </span>
      ))}
    </span>
  );
}

const ROLE_COLORS: Record<string, string> = {
  CASHIER: "bg-emerald-50 text-emerald-700",
  ADMIN: "bg-purple-50 text-purple-700",
  SUPERVISOR: "bg-pink-50 text-pink-700",
  OWNER: "bg-amber-50 text-amber-700",
  KITCHEN: "bg-orange-50 text-orange-700",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// The default role is taken from ROLES rather than written out, so retiring a
// role can't leave the blank form seeded with one the server no longer accepts.
const EMPTY = { name: "", employeeId: "", username: "", password: "", role: ROLES[0] };

export function UsersManager({
  users,
  showArchived,
  canManage,
  isOwnerActor,
  roleUsage,
  suggestedEmployeeId,
}: {
  users: StaffUser[];
  showArchived: boolean;
  canManage: boolean;
  /** The signed-in user is the OWNER — only they may change the owner password. */
  isOwnerActor: boolean;
  roleUsage: RoleUsage;
  /** Placeholder only — the employee number is typed in, never assigned. */
  suggestedEmployeeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = users.filter((u) =>
    `${u.name} ${u.username} ${u.employeeId}`.toLowerCase().includes(search.toLowerCase())
  );

  /** Room left under ROLE_LIMITS, ignoring who is being edited. */
  function hasRoom(role: Role) {
    const usage = roleUsage[role];
    return !usage || usage.limit === null || usage.used < usage.limit;
  }

  /** A role is closed off once it's at capacity — unless we're already on it. */
  function roleFull(role: Role) {
    return !hasRoom(role) && editing?.role !== role;
  }

  function roleOption(role: Role) {
    const usage = roleUsage[role];
    const label = role.charAt(0) + role.slice(1).toLowerCase();
    if (!usage || usage.limit === null) return label;
    return `${label} (${usage.used}/${usage.limit}${usage.used >= usage.limit ? " — full" : ""})`;
  }

  function openCreate() {
    setEditing(null);
    // Open on a role that still has room, so the form never starts on an option
    // the select has disabled. hasRoom, not roleFull — `editing` is still the
    // previously edited user in this closure.
    setForm({ ...EMPTY, role: ROLES.find(hasRoom) ?? ROLES[0] });
    setError("");
    setShowPassword(false);
    setDialogOpen(true);
  }

  function openEdit(user: StaffUser) {
    setEditing(user);
    setForm({
      name: user.name,
      employeeId: user.employeeId,
      username: user.username,
      password: "",
      role: user.role,
    });
    setError("");
    setShowPassword(false);
    setDialogOpen(true);
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const result = editing
        ? await updateUser({
            id: editing.id,
            name: form.name,
            employeeId: form.employeeId,
            username: form.username,
            role: form.role,
            password: form.password,
          })
        : await createUser(form);

      if (!result.success) {
        setError(result.error);
        return;
      }
      setDialogOpen(false);
      router.refresh();
    });
  }

  function toggleArchive(user: StaffUser) {
    setError("");
    startTransition(async () => {
      const result = await setUserArchived(user.id, user.status === "ACTIVE");
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-56"
            />
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98]"
            >
              <Plus className="h-4 w-4" /> Add User
            </button>
          )}
          <Link
            href={showArchived ? pathname : `${pathname}?archived=1`}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              showArchived
                ? "bg-brand-navy text-white"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Viewing Archived" : "Archived"}
          </Link>
        </div>
      </div>

      {error && !dialogOpen && <p className="text-sm text-destructive">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                  Employee ID
                </th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Username</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Last Active</th>
                {canManage && (
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    {showArchived ? "No archived users." : "No users found."}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white">
                          {initials(user.name)}
                        </span>
                        <span className="font-medium text-foreground">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {user.employeeId}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{user.username}</td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                          ROLE_COLORS[user.role] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {user.role.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                          user.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {user.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(user.lastActive)}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            aria-label={`Edit ${user.name}`}
                            disabled={isPending}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* The owner account is permanent — no archive path. */}
                          {user.role === "OWNER" && user.status === "ACTIVE" ? (
                            <span className="rounded-lg bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              Permanent
                            </span>
                          ) : (
                            <button
                              onClick={() => toggleArchive(user)}
                              disabled={isPending}
                              className={cn(
                                "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                                user.status === "ACTIVE"
                                  ? "text-red-500 hover:bg-red-50"
                                  : "text-emerald-600 hover:bg-emerald-50"
                              )}
                            >
                              {user.status === "ACTIVE" ? (
                                <>
                                  <Archive className="h-3.5 w-3.5" /> Archive
                                </>
                              ) : (
                                <>
                                  <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </CardContent>
      </Card>

      <FormDialog
        title={editing ? `Edit ${editing.name}` : "Add User"}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
        submitLabel={editing ? "Save changes" : "Create user"}
        submitting={isPending}
        error={error}
      >
        {/* Typed in by hand: the store issues employee numbers, this app only
            records them. The suggestion is a placeholder, not a value, so it
            never gets saved unless someone actually types it. */}
        <Field
          label="Employee ID"
          hint={`Entered by hand and must be unique. Next free number: ${suggestedEmployeeId}`}
        >
          <input
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            required
            placeholder={suggestedEmployeeId}
            autoComplete="off"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="Full name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className={inputClass}
          />
        </Field>

        <Field
          label="Username"
          hint={editing ? "Changing this changes the name they sign in with." : undefined}
        >
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        {/* Only the owner changes the owner's password (2026-09-13). A non-owner
            editing the owner account gets an explanation instead of the field;
            the server action rejects it either way. */}
        {editing?.role === "OWNER" && !isOwnerActor ? (
          <Field label="Password" plain>
            <span className="block text-sm text-muted-foreground">
              Only the owner can change this password.
            </span>
          </Field>
        ) : (
          <Field
            label={editing ? "New password" : "Password"}
            hint={editing ? "Leave blank to keep the current password." : undefined}
            plain
          >
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editing}
                autoComplete="new-password"
                className={cn(inputClass, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {(!editing || form.password.length > 0) && (
              <PasswordChecklist value={form.password} />
            )}
          </Field>
        )}

        <Field label="Role" hint="Owner and Supervisor are limited to one account each.">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className={inputClass}
          >
            {ROLES.map((role) => (
              <option key={role} value={role} disabled={roleFull(role)}>
                {roleOption(role)}
              </option>
            ))}
          </select>
        </Field>
      </FormDialog>
    </div>
  );
}
