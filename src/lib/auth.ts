import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import bcrypt from "bcryptjs";
import { logActivity } from "./activity";
import { canSignIn } from "./roles";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user) throw new Error("Invalid credentials");

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) throw new Error("Invalid credentials");

        if (user.status !== "ACTIVE") throw new Error("Account is disabled");

        // One shared sign-in screen means nothing pins the role from the outside
        // any more, so the retired roles (cashier, kitchen) have to be refused
        // here — otherwise restoring such an account would hand it a dashboard.
        if (!canSignIn(user.role)) throw new Error("ROLE_RETIRED");

        await prisma.user.update({
          where: { id: user.id },
          data: { lastActive: new Date() },
        });

        // Only successful sign-ins are recorded — every failure above throws
        // before reaching here.
        await logActivity({
          actor: { id: user.id, name: user.name, role: user.role },
          area: "AUTH",
          action: "LOGIN",
          targetName: user.name,
          targetId: user.id,
          detail: "Signed in",
        });

        return { id: user.id, name: user.name, role: user.role };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  // NextAuth takes one hosted sign-in page and we now have exactly one, so this
  // is the real thing rather than an arbitrary pick. It must stay set: unsetting
  // it re-enables NextAuth's built-in /api/auth/signin form, which would bypass
  // our own error handling and land people nowhere in particular.
  pages: { signIn: "/staff" },
  secret: process.env.NEXTAUTH_SECRET,
};

/** Lowercase role, matching the dashboard route segments (/staff/cashier, …). */
export function roleToPath(role: string) {
  return role.toLowerCase();
}
