import { Suspense } from 'react'

import AuthPage from "../component/auth/authPage"

import { LoadingRedirect } from '../component/ui/loading'

import DefaultLayout from '@/app/layout/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Welcome to CodeDev | Login or signup",
        description: "Welcome to CodeDev, your gateway to mastering coding skills...",
    }
}

export default function Page() {
    return (
        <DefaultLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <AuthPage />
            </Suspense>
        </DefaultLayout>
    )
}