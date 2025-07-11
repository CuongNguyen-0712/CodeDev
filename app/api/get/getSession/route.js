import { getSession } from "@/app/lib/session";

export async function GET() {
    const session = await getSession()
    return new Response(JSON.stringify({ username: session.username, email: session.email }), {
        headers: {
            'Content-Type': 'application/json'
        }
    })
}