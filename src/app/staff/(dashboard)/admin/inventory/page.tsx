import InventoryPage from "../../supervisor/inventory/page";

// Admin runs Inventory read/write from 2026-08-10 — the client asked for the
// screen itself instead of the read-only Reports & Analytics and Menu
// Availability views Admin used to carry. canManage is derived from the session
// inside the page, and Admin now holds manageInventory, so the full controls
// show. The /alerts and /import routes beside this one exist because the
// screen's toolbar links to `${pathname}/alerts` and `${pathname}/import`.
//
// Route segment config is not inherited through a re-export.
export const dynamic = "force-dynamic";

export default InventoryPage;
