import type { Metadata } from "next";
import { StaffLoginForm } from "@/components/brand/staff-login-form";

export const metadata: Metadata = {
  title: "Staff Sign In",
  robots: { index: false, follow: false },
};

/**
 * The one sign-in screen for every role. It sits directly under
 * src/app/staff/layout.tsx, so it gets the .theme-staff palette without the
 * sidebar chrome, which lives a level down in (dashboard)/layout.tsx.
 */
export default function StaffLoginPage() {
  return <StaffLoginForm />;
}
