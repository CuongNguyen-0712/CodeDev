import RunDetail from "@/components/admin/runs/runDetail";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Run" };

export default async function RunPage({ params }) {
    if (!(await adminCan("submission.read"))) return <NoAccess title="Run" />;
    const { id } = await params;
    return <RunDetail runId={decodeURIComponent(id)} />;
}
