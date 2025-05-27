import { getProject } from "@/app/server/actions/get/action";

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    const data = searchParams.get('id');
    return await getProject(data);
}