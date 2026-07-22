import { Suspense } from "react";

import { LoadingRedirect } from "../component/ui/loading";

import HomePage from "../component/home/homePage";

import HomeLayout from "../layout/homeLayout";

export async function generateMetadata() {
    return {
        title: 'Home | CodeDev',
        description: 'Welcome to CodeDev, your gateway to mastering coding skills. Explore our platform to find courses, connect with peers, and enhance your coding journey.',
    };
}

export default function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <HomePage />
            </Suspense>
        </HomeLayout>
    );
}
