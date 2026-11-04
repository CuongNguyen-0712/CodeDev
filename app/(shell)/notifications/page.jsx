import { Suspense } from 'react';

import { PageSkeleton } from '@/components/ui/loading';

import NotificationsPage from '@/components/notifications/notificationsPage';

export async function generateMetadata() {
    return {
        title: 'Notifications | CodeDev',
        description: 'Your course access, level-ups and achievements on CodeDev',
    };
}

export default async function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <NotificationsPage />
        </Suspense>
    );
}
