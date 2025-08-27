import { getCourse } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getCourse({
        id: searchParams.get('id'),
        search: searchParams.get('search'),
        limit: searchParams.get('limit'),
        offset: searchParams.get('offset'),
        price: searchParams.get('price'),
        level: searchParams.get('level')
    });
}