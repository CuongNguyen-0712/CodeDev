import { getContentCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return getContentCourse({
        course_id: searchParams.get('course_id'),
        user_id: searchParams.get('user_id')
    })
}