import { postRegisterCourse } from "@/app/actions/post/action";

export async function POST() {
    return await postRegisterCourse();
}