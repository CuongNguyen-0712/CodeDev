import { Suspense } from "react"

import { LoadingRedirect } from "@/components/ui/loading"

import HomeLayout from '@/components/layouts/homeLayout';

import ProfilePage from "@/components/profile/profilePage"

export async function generateMetadata() {
    return {
        title: "Profile | CodeDev",
        description: "View and manage your profile information",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <ProfilePage />
            </HomeLayout>
        </Suspense>
    )
}