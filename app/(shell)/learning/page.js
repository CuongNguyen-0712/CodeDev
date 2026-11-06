import { Suspense } from 'react';

import { PageSkeleton } from '@/components/ui/loading';

import LearngingPage from '@/components/learning/learningPage';

export async function generateMetadata() {
    return {
        title: 'Learning | CodeDev',
        description: 'The courses you are enrolled in, split into in progress, not started and completed.',
    };
}

export default async function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <LearngingPage />
        </Suspense>
    )
}