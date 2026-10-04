import InventoryAnalyticsPage from "../../../supervisor/inventory/analytics/page";

// Admin mounts the Supervisor's screen unchanged — it holds viewInventory, so
// getMovementAnalytics answers, and it runs Inventory read/write anyway. This
// page moved off Admin on 2026-08-10 and the client asked for it back on
// 2026-08-12. The report's "Back to Inventory" link resolves because
// /staff/admin/inventory exists beside this route.
//
// Route segment config is not inherited through a re-export.
export const dynamic = "force-dynamic";

export default InventoryAnalyticsPage;
