import { updateMarkedCourse } from "@/app/actions/patch/action";

export async function PATCH(req) {
    const data = await req.json();
    return await updateMarkedCourse(data);
}