import { Suspense } from "react";
import SettingsPage, { SettingsPageSkeleton } from "@/components/settings/settingsPage";
import { getAuthSession } from "@/lib/session";

export async function generateMetadata() {
    return {
        title: "Settings | CodeDev",
        description: "Manage your account settings and preferences",
    }
}

export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<SettingsPageSkeleton />}>
            <SettingsPage viewerId={viewerId} />
        </Suspense>
    )
}