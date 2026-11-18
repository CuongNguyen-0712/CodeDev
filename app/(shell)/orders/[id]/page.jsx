import { Suspense } from "react";
import OrderStatusPage, { OrderStatusPageSkeleton } from '@/components/commerce/orderStatusPage';

// Order status is per request and never cached.
export const instant = false;

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
        <Suspense fallback={<OrderStatusPageSkeleton />}>
            <OrderStatusPage orderId={id} />
        </Suspense>
    );
}
