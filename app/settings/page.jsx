import { Suspense } from "react"

import { LoadingRedirect } from "@/app/component/ui/loading"

import Settings from "../component/settings/settings"

import NavigateLayout from "../layout/navigateLayout"

export async function generateMetadata() {
    return {
        title: "Settings | CodeDev",
        description: "Manage your account settings and preferences",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <NavigateLayout>
                <Settings />
            </NavigateLayout>
        </Suspense>
    )
}