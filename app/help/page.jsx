import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import NavigateLayout from "../layout/navigateLayout";

import HelpPage from "../component/help/helpPage";

export default function Page() {
    return (
        <NavigateLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <HelpPage />
            </Suspense>
        </NavigateLayout>
    );
}