import { getTransactions, getDailySummaries } from "@/app/actions/transactions";
import { TransactionsView } from "@/components/brand/transactions-view";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [rows, daily] = await Promise.all([getTransactions(), getDailySummaries()]);
  return <TransactionsView rows={rows} daily={daily} />;
}
