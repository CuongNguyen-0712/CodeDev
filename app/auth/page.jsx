import { Suspense } from 'react'

import AuthPage from "@/components/auth/authPage"

import { LoadingRedirect } from '@/components/ui/loading'

import DefaultLayout from '@/components/layouts/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Welcome to CodeDev | Login or signup",
        description: "Welcome to CodeDev, your gateway to mastering coding skills...",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <AuthPage />
            </DefaultLayout>
        </Suspense>
    )
}