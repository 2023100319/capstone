import { getActivity } from "@/app/actions/activity";
import { ActivityFeed } from "./activity-feed";

export const dynamic = "force-dynamic";

/**
 * Everything staff do, in one feed. Filters live in the URL so a view can be
 * refreshed, bookmarked or shared — and so paging is real server-side paging
 * rather than slicing an array that was already fully loaded.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; area?: string; staff?: string; days?: string; page?: string }>;
}) {
  const { q, area, staff, days, page } = await searchParams;

  const result = await getActivity({
    q,
    area,
    staff,
    days: Number(days) || undefined,
    page: Number(page) || undefined,
  });

  return (
    <ActivityFeed
      result={result}
      filters={{ q: q ?? "", area: area ?? "", staff: staff ?? "", days: Number(days) || 30 }}
    />
  );
}
