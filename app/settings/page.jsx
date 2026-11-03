import { Suspense } from "react"

import { PageSkeleton } from "@/components/ui/loading"

import SettingsPage from "@/components/settings/settingsPage"

import HomeLayout from '@/components/layouts/homeLayout';

export async function generateMetadata() {
    return {
        title: "Settings | CodeDev",
        description: "Manage your account settings and preferences",
    }
}

export default function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<PageSkeleton />}>
                <SettingsPage />
            </Suspense>
        </HomeLayout>
    )
}