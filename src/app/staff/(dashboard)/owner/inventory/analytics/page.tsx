import InventoryAnalyticsPage from "../../../supervisor/inventory/analytics/page";

// Owner mounts the Supervisor's screen unchanged — both hold viewInventory and
// manageInventory, so there is nothing to hide. This used to live on Admin as a
// read-only view; the client moved it here in 2026-08-10.
//
// Route segment config is not inherited through a re-export.
export const dynamic = "force-dynamic";

export default InventoryAnalyticsPage;
