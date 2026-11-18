import { Suspense } from "react";
import ProfilePage, { ProfilePageSkeleton } from "@/components/profile/profilePage";
import { getAuthSession } from "@/lib/session";

export async function generateMetadata() {
    return {
        title: "Profile | CodeDev",
        description: "View and manage your profile information",
    }
}

export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<ProfilePageSkeleton />}>
            <ProfilePage viewerId={viewerId} />
        </Suspense>
    )
}