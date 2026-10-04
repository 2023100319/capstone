import MenuAvailabilityPage from "../../../supervisor/inventory/availability/page";

// Owner mounts the Supervisor's screen unchanged. Nested under `inventory/` so
// the view's "Back to Inventory" link resolves to /staff/owner/inventory, which
// exists. Moved off Admin in 2026-08-10.
//
// Route segment config is not inherited through a re-export.
export const dynamic = "force-dynamic";

export default MenuAvailabilityPage;
