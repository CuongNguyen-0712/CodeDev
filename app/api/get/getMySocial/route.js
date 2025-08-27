import { getMySocial } from "@/app/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    return await getMySocial({
        id: searchParams.get('id'),
        tab: searchParams.get('tab'),
        search: searchParams.get('search')
    })
}