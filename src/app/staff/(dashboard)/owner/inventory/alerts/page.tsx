import StockAlertsPage from "../../../supervisor/inventory/alerts/page";

// Owner reuses the Supervisor Reorder & Alerts screen. canManage is derived from
// the session inside that page; the Owner holds manageInventory, so Mark Expired
// and the rest of the controls show.
// Route segment config is not inherited through a re-export, so it's redeclared.
export const dynamic = "force-dynamic";

export default StockAlertsPage;
