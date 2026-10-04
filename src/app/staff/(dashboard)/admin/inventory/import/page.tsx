import SalesImportPage from "../../../supervisor/inventory/import/page";

// Admin reuses the Supervisor Import Sales screen — reached from the Inventory
// toolbar, which only renders that link for a role holding manageInventory.
// Route segment config is not inherited through a re-export, so it's redeclared.
export const dynamic = "force-dynamic";

export default SalesImportPage;
