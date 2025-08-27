import { getSession } from "@/app/lib/session";

export default async function GetMySocialService({ tab, search }) {
    const params = new URLSearchParams();
    const id = (await getSession())?.userId;
    params.set('id', id)
    if (tab) params.set('tab', tab)
    if (search) params.set('search', search)

    try {
        const res = await fetch(`/api/get/getMySocial?${params.toString()}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )

        if (res.status === 404) {
            return {
                status: 404,
                message: 'API not found'
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

    }
    catch (err) {
        console.error(err);
        return {
            status: 500,
            message: err.message || 'Something is wrong'
        }
    }
}