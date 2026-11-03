import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui/loading";

import ContactPage from "@/components/contact/contactPage";

export const metadata = {
    title: "Contacts | CodeDev",
    description: "Find other CodeDev learners by username.",
};

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ContactPage />
        </Suspense>
    )
}