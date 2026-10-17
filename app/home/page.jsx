import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getAuthSession } from "@/lib/session";
import { onboardingService } from "@/services/onboarding.service";

import { LoadingRedirect } from "@/components/ui/loading";

import HomePage from "@/components/home/homePage";

import HomeLayout from '@/components/layouts/homeLayout';

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
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <HomePage />
            </HomeLayout>
        </Suspense>
    );
}
