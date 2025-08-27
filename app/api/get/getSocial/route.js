import { getSocial } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getSocial({
        id: searchParams.get('id'),
        search: searchParams.get('search'),
        offset: searchParams.get('offset'),
        limit: searchParams.get('limit'),
        filter: searchParams.get('filter')
    });
}