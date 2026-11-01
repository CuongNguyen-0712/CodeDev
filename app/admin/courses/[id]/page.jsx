import CourseDetail from "@/components/admin/courses/courseDetail";

export const metadata = { title: "Course" };

export default async function AdminCoursePage({ params }) {
    const { id } = await params;
    return <CourseDetail courseId={decodeURIComponent(id)} />;
}
