import CourseDetail from "@/components/admin/courses/courseDetail";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Course" };

export default async function AdminCoursePage({ params }) {
    const { id } = await params;
    return <CourseDetail courseId={decodeURIComponent(id)} />;
}
