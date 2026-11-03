import { Suspense } from 'react';

import HomeLayout from '@/components/layouts/homeLayout';

import { PageSkeleton } from '@/components/ui/loading';

import OrdersPage from '@/components/commerce/ordersPage';

export async function generateMetadata() {
    return {
        title: 'Orders and points | CodeDev',
        description: 'Your course orders and point balance on CodeDev',
    };
}

export default async function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<PageSkeleton />}>
                <OrdersPage />
            </Suspense>
        </HomeLayout>
    );
}
