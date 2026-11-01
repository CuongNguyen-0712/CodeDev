import CourseAdmin from "@/components/admin/courseAdmin";
import PageHeader from "@/components/admin/shell/pageHeader";

export const metadata = { title: "Courses" };

export default function CoursesPage() {
    return (
        <>
            <PageHeader title="Courses" description="Metadata, publishing and prices. Every change is written to the audit log." />
            <CourseAdmin />
        </>
    );
}
