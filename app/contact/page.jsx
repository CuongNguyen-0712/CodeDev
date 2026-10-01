import { Suspense } from "react";

import HomeLayout from "@/components/layouts/homeLayout";

import { LoadingRedirect } from "@/components/ui/loading";

import ContactPage from "@/components/contact/contactPage";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <ContactPage />
            </HomeLayout>
        </Suspense>
    )
}