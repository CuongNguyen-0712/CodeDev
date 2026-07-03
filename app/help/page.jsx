import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import NavigateLayout from "../layout/navigateLayout";

import Help from "../component/help/help";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <NavigateLayout>
                <Help />
            </NavigateLayout>
        </Suspense>
    );
}