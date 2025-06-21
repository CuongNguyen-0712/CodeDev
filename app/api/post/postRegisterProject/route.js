import { postRegisterProject } from "@/app/actions/post/action";

export async function POST(req) {
    const data = await req.json();
    return await postRegisterProject(data);
}