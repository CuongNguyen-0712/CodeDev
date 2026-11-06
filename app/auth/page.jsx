import { Suspense } from 'react'

import AuthPage from "@/components/auth/authPage"

import { LoadingRedirect } from '@/components/ui/loading'

import DefaultLayout from '@/components/layouts/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Sign in or create an account | CodeDev",
        description: "Sign in to continue your courses, or create an account to enroll, submit challenges and keep your progress.",
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