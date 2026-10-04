import { BrandLogo } from "./brand-logo";

export function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background p-6">
      <div className="relative w-full max-w-md rounded-2xl bg-card px-8 py-10 shadow-md sm:px-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo variant="staff" size={96} className="shadow-md" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
