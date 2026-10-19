import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import HomeLayout from '@/components/layouts/homeLayout';

import HelpPage from "@/components/help/helpPage";

export const metadata = {
    title: "Help | CodeDev",
    description: "Answers to common questions about courses, challenges, points and your account.",
};

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <HelpPage />
            </HomeLayout>
        </Suspense>
    );
}