import { getCommentCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return getCommentCourse({
        course_id: searchParams.get('course_id'),
        offset: searchParams.get('offset'),
        limit: searchParams.get('limit')
    })
}