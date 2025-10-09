import { getContentLesson } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return getContentLesson({
        user_id: searchParams.get('user_id'),
        lesson_id: searchParams.get('lesson_id'),
    })
}