'use client'
import Navbar from '@/components/ui/navbar';
import Dashboard from '@/components/ui/dashboard';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import VerifyEmailBanner from '@/components/auth/verifyEmailBanner';
import { SignedIn } from '@/components/auth/signedIn';

import { SidebarInset, SidebarProvider } from '@/components/shadcn/sidebar';

import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/contexts/appContext";

// The feedback form (and the zod schemas it validates with) loads only once `?modal=feedback` is set,
// so it stays out of every page's initial bundle.
const Feedback = dynamic(() => import('@/components/ui/feedback'));

// Opened only after the page has hydrated: on a direct load of `?modal=feedback` the dialog would
// otherwise set aria-hidden on page markup that is still hydrating (a hydration mismatch).
function FeedbackGate() {
    const params = useSearchParams();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        // Safari has no requestIdleCallback.
        const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        const cancel = window.cancelIdleCallback || clearTimeout;
        const id = idle(() => setReady(true));
        return () => cancel(id);
    }, []);
    return ready && params.get('modal') === 'feedback' ? <Feedback /> : null;
}

function LayoutContent({ children, footer }) {
    const {
        isDashboard,
        setDashboard,
    } = useApp();

    return (
        <SidebarProvider
            open={isDashboard}
            onOpenChange={setDashboard}
            className="h-dvh min-h-0 overflow-hidden"
        >
            <a
                href="#container"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md"
            >
                Skip to content
            </a>
            <Dashboard />

            <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
                <Navbar />
                <SignedIn><VerifyEmailBanner /></SignedIn>

                {/* The page scroller: hooks/useInfiniteScroll observes it by id. The page is at least a
                    screen tall, so the footer starts below the fold: otherwise it shows at the bottom
                    while a page loads its data and is pushed down when the data arrives (a layout shift).
                    shrink-0 with it: min-h-dvh replaces the flex item's content-based minimum, and
                    without shrink-0 a page taller than a screen is squeezed to one screen and spills
                    out under the footer. */}
                <section
                    id='container'
                    tabIndex={-1}
                    className='page-enter [&>:not(footer)]:min-h-dvh [&>:not(footer)]:shrink-0 outline-none flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background [overflow-anchor:none] **:[overflow-anchor:none]'
                >
                    {children}
                    {footer}
                </section>
            </SidebarInset>

            <Suspense fallback={null}>
                <FeedbackGate />
            </Suspense>
            {/* Toasts: rendered once by the root providers (AppToaster), not per page layout. */}
        </SidebarProvider>
    );
}

// Mounted once by app/(shell)/layout.jsx; `footer` is rendered on the server and passed in.
export default function HomeLayout({ children, footer }) {
    return (
        <LayoutContent footer={footer}>
            {children}
        </LayoutContent>
    );
}
