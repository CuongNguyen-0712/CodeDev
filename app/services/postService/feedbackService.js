import { getSession } from "@/app/lib/session";

export default async function PostFeedbackService(data) {
    const sender = (await getSession())?.userId;
    const req = { ...data, sender: sender };
    try {
        const res = await fetch('/api/post/postFeedback', {
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
                data: raw.data,
                message: raw.message || "Send feedback successfully"
            }
        }
        else {
            return {
                status: res.status,
                message: raw.message || "Unknown server error"
            }
        }
    }
    catch (err) {
        return {
            status: 500,
            message: err.message
        }
    }
}