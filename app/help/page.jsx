import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import NavigateLayout from '@/components/layouts/navigateLayout';

import HelpPage from "@/components/help/helpPage";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <NavigateLayout>
                <HelpPage />
            </NavigateLayout>
        </Suspense>
    );
}