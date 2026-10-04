import MenuManagementPage from "../../supervisor/menu/page";

// The client asked for the Menu page back on Admin. It is the same screen the
// Supervisor and Owner use — Admin has `manageMenu`, so every control is live.
//
// Route segment config is not inherited through a re-export.
export const dynamic = "force-dynamic";

export default MenuManagementPage;
