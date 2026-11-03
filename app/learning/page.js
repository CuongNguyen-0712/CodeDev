import { Suspense } from 'react';

import HomeLayout from '@/components/layouts/homeLayout';

import { PageSkeleton } from '@/components/ui/loading';

import LearngingPage from '@/components/learning/learningPage';

export async function generateMetadata() {
    return {
        title: 'Learning | CodeDev',
        description: 'Learning page for CodeDev platform',
    };
}

export default async function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<PageSkeleton />}>
                <LearngingPage />
            </Suspense>
        </HomeLayout>
    )
}