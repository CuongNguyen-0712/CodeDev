import { Suspense } from 'react';

import HomeLayout from '@/components/layouts/homeLayout';

import { LoadingRedirect } from '@/components/ui/loading';

import OrderStatusPage from '@/components/commerce/orderStatusPage';

export async function generateMetadata() {
    return {
        title: 'Order status | CodeDev',
        description: 'Payment and order status',
    };
}

// Payment return page: the order status always comes from the server, never from query params.
export default async function Page({ params }) {
    const { id } = await params;

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <OrderStatusPage orderId={id} />
            </HomeLayout>
        </Suspense>
    );
}
