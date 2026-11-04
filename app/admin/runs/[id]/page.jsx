import RunDetail from "@/components/admin/runs/runDetail";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Run" };

export default async function RunPage({ params }) {
    if (!(await adminCan("submission.read"))) return <NoAccess title="Run" />;
    const { id } = await params;
    return <RunDetail runId={decodeURIComponent(id)} />;
}
