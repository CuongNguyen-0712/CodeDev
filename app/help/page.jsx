import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import HomeLayout from '@/components/layouts/homeLayout';

import HelpPage from "@/components/help/helpPage";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <HelpPage />
            </HomeLayout>
        </Suspense>
    );
}