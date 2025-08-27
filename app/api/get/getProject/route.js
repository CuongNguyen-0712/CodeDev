import { getProject } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getProject({
        id: searchParams.get('id'),
        search: searchParams.get('search'),
        limit: searchParams.get('limit'),
        offset: searchParams.get('offset'),
        method: searchParams.get('method'),
        status: searchParams.get('status'),
        difficulty: searchParams.get('difficulty')
    });
}