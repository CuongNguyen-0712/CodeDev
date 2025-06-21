import { getSession } from "@/app/lib/session";

export default async function PostRegisterProjectService(data) {
    const userId = (await getSession())?.userId;
    const req = { ...data, userId: userId }
    try {
        const res = await fetch('/api/post/postRegisterProject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req)
        });

        if (res.status == 404) {
            return {
                status: 404,
                message: 'API not found'
            }
        }

        const raw = await res.json();
        if (res.ok) {
            return {
                status: res.status,
                message: raw.message || "Register project successfully"
            }
        }
        else {
            return {
                status: res.status,
                message: raw.message
            }
        }
    }
    catch (err) {
        return {
            status: 500,
            message: err.message || "Something is wrong"
        }
    }
}