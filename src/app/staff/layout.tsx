export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="theme-staff min-h-screen flex flex-col bg-background text-foreground">
      {children}
    </div>
  );
}
