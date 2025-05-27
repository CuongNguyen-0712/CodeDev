import { deleteMyCourse } from "@/app/actions/delete/action";

export async function DELETE(req) {
    const data = await req.json();
    return await deleteMyCourse(data);
}