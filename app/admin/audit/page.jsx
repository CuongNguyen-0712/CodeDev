import { Suspense } from "react";

import AuditPage from "@/components/admin/audit/auditPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Audit" };

export default async function AdminAuditPage() {
    if (!(await adminCan("audit.read"))) return <NoAccess title="Audit" />;
    return <Suspense><AuditPage /></Suspense>;
}
