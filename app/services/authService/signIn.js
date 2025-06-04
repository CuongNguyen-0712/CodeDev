export default async function SignInService(data) {
    const res = fetch('/api/auth/signin',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        }
    )

    if (res.status === 404) {
        return {
            status: 404,
            message: "API not found"
        }
    }

    const raw = await res.json()

    if (res.ok) {
        return {
            status: res.status,
            data: raw.data,
            message: raw.message || "Login successfully"
        }
    } else {
        return {
            status: res.status,
            message: raw.message || "Unknown server error"
        }
    }
}