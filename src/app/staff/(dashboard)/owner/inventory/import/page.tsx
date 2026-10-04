import SalesImportPage from "../../../supervisor/inventory/import/page";

// Owner reuses the Supervisor Import Sales screen. canManage is derived from the
// session inside that page, so the Owner (who now manages inventory) gets the
// full upload/preview/apply UI. Route segment config is not inherited through a
// re-export, so it's redeclared.
export const dynamic = "force-dynamic";

export default SalesImportPage;
