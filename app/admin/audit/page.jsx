import { Suspense } from "react";

import AuditPage from "@/components/admin/audit/auditPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Audit" };

export default async function AdminAuditPage() {
    if (!(await adminCan("audit.read"))) return <NoAccess title="Audit" />;
    return <Suspense><AuditPage /></Suspense>;
}
