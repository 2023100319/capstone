import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Staff Sign In",
  robots: { index: false, follow: false },
};

// The per-role sign-in screens are gone — everyone signs in at /staff and the
// account's own role decides the dashboard. This stub keeps the old bookmark
// working instead of 404ing it.
export default function OwnerLoginRedirect() {
  redirect("/staff");
}
