import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import HomeLayout from '@/components/layouts/homeLayout'

import Blog from "@/components/blog/blog"

export const metadata = {
    title: "Blog | CodeDev",
    description: "Articles about programming, learning to code and updates to CodeDev.",
};

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <Blog />
            </HomeLayout>
        </Suspense>
    );
}