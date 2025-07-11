import { getSession } from "@/app/lib/session";

export default async function GetSocialService({ search }) {
    const params = new URLSearchParams();

    params.set('id', (await getSession())?.userId);
    if (search) params.set('search', search);

    try {
        const res = await fetch(`/api/get/getSocial?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (res.status === 404) {
            return {
                status: 404,
                message: "API not found"
            }
        }

        const raw = await res.json();

        if (res.ok) {
            return {
                status: res.status,
                data: raw.data
            }
        }
        else {
            return {
                status: res.status,
                message: raw.message
            }
        }
    } catch (error) {
        return {
            status: 500,
            message: error.message
        }
    }
}