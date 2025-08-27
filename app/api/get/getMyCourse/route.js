import { getMyCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getMyCourse({
        id: searchParams.get('id'),
        search: searchParams.get('search'),
        limit: searchParams.get('limit'),
        offset: searchParams.get('offset'),
        hide: searchParams.get('hide')
    });
}