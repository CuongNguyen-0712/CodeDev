import { signIn } from "@/app/actions/auth/action";

export async function POST(req) {
    const data = await req.body;
    return await signIn(data);
}