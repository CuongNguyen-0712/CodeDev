import { updateLesson } from "@/app/actions/patch/action";

export async function PATCH(req) {
    const data = await req.json();
    return await updateLesson(data);
}