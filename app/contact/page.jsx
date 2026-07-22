import { Suspense } from "react";

import HomeLayout from "@/app/layout/homeLayout";

import { LoadingRedirect } from "@/app/component/ui/loading";

import ContactPage from "@/app/component/contact/contactPage";

export default function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <ContactPage />
            </Suspense>
        </HomeLayout>
    )
}