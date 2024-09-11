'use client'

import { AuthProvider } from "./component/auth/handleAuth/authContext"
import Form from "./component/auth/form/form"

export default function Page() {

    return (
        <>
            <AuthProvider>
                <Form />
            </AuthProvider>
        </>
    )
}