import { postRegisterCourse } from "@/app/actions/post/action";

export async function POST(req) {
    const data = await req.json();
    return await postRegisterCourse(data);
}