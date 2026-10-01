import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import HomeLayout from '@/components/layouts/homeLayout'

import Blog from "@/components/blog/blog"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <Blog />
            </HomeLayout>
        </Suspense>
    );
}