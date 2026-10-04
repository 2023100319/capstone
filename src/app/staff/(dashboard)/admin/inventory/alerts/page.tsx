import StockAlertsPage from "../../../supervisor/inventory/alerts/page";

// Admin reuses the Supervisor Reorder & Alerts screen — reached from the
// Inventory toolbar. canManage is derived from the session inside that page.
// Route segment config is not inherited through a re-export, so it's redeclared.
export const dynamic = "force-dynamic";

export default StockAlertsPage;
