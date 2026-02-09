import { Suspense } from 'react'

import Form from "../component/auth/form"

import { LoadingRedirect } from '../component/ui/loading'

export async function generateMetadata() {
    return {
        title: "Welcome to CodeDev | Login or signup",
        description: "Welcome to CodeDev, your gateway to mastering coding skills...",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Form />
        </Suspense>
    )
}