import { getSession } from "@/app/lib/session";

export default async function UpdateInfoService(data) {
    const id = (await getSession())?.userId;
    const req = { ...data, id: id };
    try {
        const res = await fetch('/api/update/updateInfo', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req)
        });

        if (res.status === 404) {
            console.error("API not found");
            return {
                status: 404,
                message: "API not found"
            };
        }

        const raw = await res.json();

        if (res.ok) {
            return {
                status: res.status,
                data: raw.data,
                message: "Update infomation successfully"
            };
        } else {
            return {
                status: res.status,
                message: raw.message || "Unknown server error"
            };
        }
    }
    catch (err) {
        console.error("Network/API call failed:", err);
        return {
            status: 500,
            message: "Failed to call API"
        };
    }
}
