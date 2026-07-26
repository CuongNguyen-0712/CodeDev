import { Suspense } from "react"

import { LoadingRedirect } from "@/app/component/ui/loading"

import NavigateLayout from "../layout/navigateLayout"

import Profile from "../component/profile/profile"

export async function generateMetadata() {
    return {
        title: "Profile | CodeDev",
        description: "View and manage your profile information",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <NavigateLayout>
                <Profile />
            </NavigateLayout>
        </Suspense>
    )
}