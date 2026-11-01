import { Suspense } from "react";

import RunList from "@/components/admin/runs/runList";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Runs" };

export default async function RunsPage() {
    if (!(await adminCan("submission.read"))) return <NoAccess title="Runs" />;
    return <Suspense><RunList /></Suspense>;
}
