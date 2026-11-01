import { AuditLog } from "@/components/admin/ordersAdmin";
import NoAccess from "@/components/admin/shell/noAccess";
import PageHeader from "@/components/admin/shell/pageHeader";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Audit" };

export default async function AuditPage() {
    if (!(await adminCan("audit.read"))) return <NoAccess title="Audit" />;
    return (
        <>
            <PageHeader title="Audit" description="Every privileged change, newest first. The log is append-only." />
            <AuditLog />
        </>
    );
}
