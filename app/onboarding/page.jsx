import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import OnboardingPage from "@/components/onboarding/onboardingPage";

import DefaultLayout from "@/components/layouts/defaultLayout";

export async function generateMetadata() {
    return {
        title: "Get started | CodeDev",
        description: "Tell us your role, level and goals so CodeDev can recommend the right courses.",
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <OnboardingPage />
            </DefaultLayout>
        </Suspense>
    );
}
