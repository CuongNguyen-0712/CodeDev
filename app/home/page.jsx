import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import HomePage from "@/components/home/homePage";

import HomeLayout from '@/components/layouts/homeLayout';

export async function generateMetadata() {
    return {
        title: 'Home | CodeDev',
        description: 'Welcome to CodeDev, your gateway to mastering coding skills. Explore our platform to find courses, connect with peers, and enhance your coding journey.',
    };
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <HomePage />
            </HomeLayout>
        </Suspense>
    );
}
