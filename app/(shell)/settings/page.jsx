import { Suspense } from "react"

import { PageSkeleton } from "@/components/ui/loading"

import SettingsPage from "@/components/settings/settingsPage"

export async function generateMetadata() {
    return {
        title: "Settings | CodeDev",
        description: "Manage your account settings and preferences",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <SettingsPage />
        </Suspense>
    )
}