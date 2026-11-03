import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui/loading";

import HelpPage from "@/components/help/helpPage";

export const metadata = {
    title: "Help | CodeDev",
    description: "Answers to common questions about courses, challenges, points and your account.",
};

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <HelpPage />
        </Suspense>
    );
}