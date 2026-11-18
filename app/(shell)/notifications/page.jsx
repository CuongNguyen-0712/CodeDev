import { Suspense } from 'react';

import NotificationsPage, { NotificationsPageSkeleton } from '@/components/notifications/notificationsPage';
import { getAuthSession } from '@/lib/session';

export async function generateMetadata() {
    return {
        title: 'Notifications | CodeDev',
        description: 'Your course access, level-ups and achievements on CodeDev',
    };
}

export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<NotificationsPageSkeleton />}>
            <NotificationsPage viewerId={viewerId} />
        </Suspense>
    );
}
