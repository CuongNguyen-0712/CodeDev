import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/loading";

import OrderStatusPage from '@/components/commerce/orderStatusPage';

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
        <Suspense fallback={<PageSkeleton />}>
            <OrderStatusPage orderId={id} />
        </Suspense>
    );
}
