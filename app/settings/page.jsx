import { Suspense } from "react"

import { LoadingRedirect } from "@/components/ui/loading"

import SettingsPage from "@/components/settings/settingsPage"

import NavigateLayout from '@/components/layouts/navigateLayout'

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
                <SettingsPage />
            </NavigateLayout>
        </Suspense>
    )
}