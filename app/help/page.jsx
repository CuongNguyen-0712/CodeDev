import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import NavigateLayout from "../layout/navigateLayout";

import HelpPage from "../component/help/helpPage";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <NavigateLayout>
                <HelpPage />
            </NavigateLayout>
        </Suspense>
    );
}