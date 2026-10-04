import Image from "next/image";
import { cn } from "@/lib/utils";
import logoCustomer from "@/../public/logo-customer.png";
import logoStaff from "@/../public/logo-staff.png";

const LOGOS = {
  customer: logoCustomer,
  staff: logoStaff,
} as const;

export function BrandLogo({
  variant = "customer",
  size = 64,
  className,
}: {
  variant?: keyof typeof LOGOS;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={LOGOS[variant]}
      alt="Ericahlicious Food Inc. logo"
      width={size}
      height={size}
      className={cn("rounded-full object-contain", className)}
    />
  );
}
