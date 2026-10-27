import { Suspense } from "react"

import VerifyRequired from "@/components/auth/verifyRequired"

import DefaultLayout from '@/components/layouts/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Verify your email | CodeDev",
        description: "Confirm your email address to keep using CodeDev.",
    }
}

export default function Page() {
    return (
        <DefaultLayout>
            <main className="flex min-h-[70dvh] w-full items-center justify-center px-4 py-16 sm:px-6">
                {/* useSearchParams needs a Suspense boundary for static rendering. */}
                <Suspense>
                    <VerifyRequired />
                </Suspense>
            </main>
        </DefaultLayout>
    )
}
