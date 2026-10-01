import IndexPage from "@/components/index"

import { Suspense } from "react"

import HomeLayout from '@/components/layouts/homeLayout'

import { LoadingRedirect } from "@/components/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <IndexPage />
            </HomeLayout>
        </Suspense>
    )
}