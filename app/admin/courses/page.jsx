import CourseAdmin from "@/components/admin/courseAdmin";
import PageHeader from "@/components/admin/shell/pageHeader";
import { CoursesFinding } from "@/components/admin/ui/pageFindings";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Courses" };

export default function CoursesPage() {
    return (
        <>
            <PageHeader title="Courses" description={<CoursesFinding fallback="Metadata, publishing and prices. Every change is written to the audit log." />} />
            <CourseAdmin />
        </>
    );
}
