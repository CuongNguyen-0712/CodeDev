import { Suspense } from 'react';

import HomeLayout from '@/app/layout/homeLayout';

import { LoadingRedirect } from '@/app/component/ui/loading';

import LearngingPage from '@/app/component/learning/learningPage';

export async function generateMetadata() {
    return {
        title: 'Learning | CodeDev',
        description: 'Learning page for CodeDev platform',
    };
}

export default async function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <LearngingPage />
            </HomeLayout>
        </Suspense>
    )
}