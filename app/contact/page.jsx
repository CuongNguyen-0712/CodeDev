import { Suspense } from "react";

import HomeLayout from "@/app/layout/homeLayout";

import { LoadingRedirect } from "@/app/component/ui/loading";

import ContactPage from "@/app/component/contact/contactPage";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <ContactPage />
            </HomeLayout>
        </Suspense>
    )
}