import { getMyCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    const data = searchParams.get('id');
    return await getMyCourse(data);
}