import IndexPage from "@/components/index"

import { Suspense } from "react"

import HomeLayout from '@/components/layouts/homeLayout'

import { LoadingRedirect } from "@/components/ui/loading"

export const metadata = {
    title: "CodeDev | Learn to code by writing code",
    description: "Short written lessons with coding challenges you solve in the browser.",
};

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <IndexPage />
            </HomeLayout>
        </Suspense>
    )
}