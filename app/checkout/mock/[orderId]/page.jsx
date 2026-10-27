import { Suspense } from 'react';

import DefaultLayout from '@/components/layouts/defaultLayout';

import { LoadingRedirect } from '@/components/ui/loading';

import MockCheckoutPage from '@/components/commerce/mockCheckoutPage';

export async function generateMetadata() {
    return {
        title: 'Test payment | CodeDev',
        description: 'Simulated payment page (development only)',
        robots: { index: false, follow: false },
    };
}

// Development only: the API behind it answers 404 when the mock payment provider is disabled.
export default async function Page({ params }) {
    const { orderId } = await params;

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <main className="w-full">
                    <MockCheckoutPage orderId={orderId} />
                </main>
            </DefaultLayout>
        </Suspense>
    );
}
