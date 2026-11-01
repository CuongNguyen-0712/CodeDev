import { redirect } from "next/navigation";

// shortcut: the Overview dashboard lands in P1 (docs/admin-panel-plan.md 01); until then the first screen is Courses.
export default function AdminIndex() {
    redirect("/admin/courses");
}
