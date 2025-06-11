import { signUp } from "@/app/actions/auth/action";

export async function POST(req) {
    const data = await req.json();
    return await signUp(data);
}