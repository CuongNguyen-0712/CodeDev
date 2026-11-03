import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/loading";

import { redirect } from "next/navigation";

import { getAuthSession } from "@/lib/session";
import { onboardingService } from "@/services/onboarding.service";

import HomePage from "@/components/home/homePage";

// The onboarding check redirects before anything is sent, so this page waits for the server
// (docs/rendering-strategy-plan.md, decision on /home).
export const instant = false;

export async function generateMetadata() {
    return {
        title: 'Home | CodeDev',
        description: 'Welcome to CodeDev, your gateway to mastering coding skills. Explore our platform to find courses, connect with peers, and enhance your coding journey.',
    };
}

export default async function Page() {
    // Login and signup land here: a learner whose onboarding is not started / in progress is sent
    // to it (skipped and completed are not asked again). Server-side, from the database.
    const session = await getAuthSession({ soft: true });
    if (session?.user?.id && await onboardingService.needsOnboarding({ userId: session.user.id })) {
        redirect("/onboarding");
    }

    return (
        <Suspense fallback={<PageSkeleton />}>
            <HomePage />
        </Suspense>
    );
}
