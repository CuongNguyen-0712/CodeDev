import SystemPage from "@/components/admin/system/systemPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "System" };

export default async function AdminSystemPage() {
    if (!(await adminCan("ops.read"))) return <NoAccess title="System" />;
    return <SystemPage />;
}
