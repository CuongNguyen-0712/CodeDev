export default async function SignUpService(data) {
    try {
        const res = await fetch('/api/auth/signUp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        })

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
                success: raw.success,
                message: raw.message || "Sign up successfully"
            }
        } else {
            return {
                status: res.status,
                success: raw.success,
                message: raw.message
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