"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import type { Role } from "@prisma/client";
import { AuthShell } from "@/components/brand/auth-shell";
import { HOME_BY_ROLE } from "@/lib/roles";

/**
 * The sign-in form — one screen for every role. Nothing here says which role you
 * are: the account's own role decides that, and it's read off the session the
 * moment sign-in succeeds so we know which dashboard to open.
 */
export function StaffLoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setError(
        result.error === "ROLE_RETIRED"
          ? "That account no longer has access. Contact your admin."
          : "Invalid username or password."
      );
      return;
    }

    // signIn() only reports success — the role lives on the session it just
    // created, so refetch it. useSession() wouldn't have caught up yet.
    const session = await getSession();
    const role = session?.user?.role as Role | undefined;
    const home = role ? HOME_BY_ROLE[role] : undefined;

    if (!home) {
      setLoading(false);
      setError("Signed in, but this account has no dashboard. Contact your admin.");
      return;
    }

    router.push(home);
  }

  const inputClass =
    "w-full rounded-xl border border-transparent bg-muted px-4 py-3 text-sm text-foreground placeholder-muted-foreground/70 transition-all focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <AuthShell subtitle="Staff Sign In">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          Forgot your password? Contact your admin to have it reset.
        </p>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-brand-blue-dark active:scale-[.99] disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthShell>
  );
}
