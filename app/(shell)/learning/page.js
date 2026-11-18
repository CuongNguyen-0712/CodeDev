import { Suspense } from 'react';

import LearningPage, { LearningPageSkeleton } from '@/components/learning/learningPage';
import { getAuthSession } from '@/lib/session';

export async function generateMetadata() {
    return {
        title: 'Learning | CodeDev',
        description: 'The courses you are enrolled in, split into in progress, not started and completed.',
    };
}

export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<LearningPageSkeleton />}>
            <LearningPage viewerId={viewerId} />
        </Suspense>
    );
}