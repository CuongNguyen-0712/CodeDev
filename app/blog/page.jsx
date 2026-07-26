import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import HomeLayout from "../layout/homeLayout"

import Blog from "../component/blog/blog"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <Blog />
            </HomeLayout>
        </Suspense>
    );
}