import { getSession } from "@/app/lib/session";

export default async function GetOverviewService() {
    const id = (await getSession())?.userId;
    try {
        const res = await fetch(`/api/get/getOverview?id=${id}`, {
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
            };
        }
        else {
            return {
                status: res.status,
                message: raw.message
            }
        }

    } catch (err) {
        return {
            status: 500,
            message: err.message
        }
    }
}