import SystemPage from "@/components/admin/system/systemPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "System" };

export default async function AdminSystemPage() {
    if (!(await adminCan("ops.read"))) return <NoAccess title="System" />;
    return <SystemPage />;
}
