import { getStateCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getStateCourse({
        course_id: searchParams.get('course_id')
    });
}