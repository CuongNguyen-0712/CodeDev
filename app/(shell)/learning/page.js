import { Suspense } from 'react';

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
        <Suspense fallback={<PageSkeleton />}>
            <LearngingPage />
        </Suspense>
    )
}