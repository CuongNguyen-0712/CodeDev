import { Suspense } from 'react';

import OrdersPage, { OrdersPageSkeleton } from '@/components/commerce/ordersPage';
import { getAuthSession } from '@/lib/session';

export async function generateMetadata() {
    return {
        title: 'Orders and points | CodeDev',
        description: 'Your course orders and point balance on CodeDev',
    };
}

export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    const viewerId = session?.user?.id;

    return (
        <Suspense fallback={<OrdersPageSkeleton />}>
            <OrdersPage viewerId={viewerId} />
        </Suspense>
    );
}
