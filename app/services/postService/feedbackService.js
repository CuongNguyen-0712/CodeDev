import { getSession } from "@/app/lib/session";

export default async function PostFeedbackService(data) {
    const sender = (await getSession())?.userId;
    const email = (await getSession())?.email;

    if (!email) {
        return {
            status: 401,
            message: "User not authenticated"
        }
    }

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
            const req = {
                to: email,
                subject: 'Thanks for your feedback to CodeDev team',
                type: 'feedback'
            };

            await fetch('/api/post/sendEmail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(req)
            });

            return {
                status: res.status,
                message: raw.message
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