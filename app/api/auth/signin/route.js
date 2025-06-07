import { signIn } from "@/app/actions/auth/action";

export async function POST(req) {
    const data = await req.json();
    return await signIn(data);
}