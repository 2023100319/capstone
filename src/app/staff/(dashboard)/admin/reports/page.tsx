import { getReport, getReportProducts } from "@/app/actions/reports";
import { parseMonth, parseRange, recentMonths } from "@/types/reports";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; month?: string; product?: string }>;
}) {
  const { range, month, product } = await searchParams;

  const [report, products] = await Promise.all([
    getReport({
      range: parseRange(range),
      month: parseMonth(month),
      menuItemId: product,
    }),
    getReportProducts(),
  ]);

  return <ReportsView report={report} months={recentMonths()} products={products} />;
}
