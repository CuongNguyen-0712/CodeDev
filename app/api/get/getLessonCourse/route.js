import { getLessonCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return getLessonCourse({
        course_id: searchParams.get('course_id'),
    })
}