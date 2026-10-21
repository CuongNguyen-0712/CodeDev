'use client'
import Navbar from '@/components/ui/navbar';
import Dashboard from '@/components/ui/dashboard';
import Feedback from '@/components/ui/feedback';
import Footer from '@/components/ui/footer';

import { SidebarInset, SidebarProvider } from '@/components/shadcn/sidebar';

import { useApp } from "@/contexts/appContext";

function LayoutContent({ children }) {
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

                {/* The page scroller: hooks/useInfiniteScroll observes it by id. */}
                <section
                    id='container'
                    tabIndex={-1}
                    className='page-enter outline-none flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background [overflow-anchor:none] **:[overflow-anchor:none]'
                >
                    {children}
                    <Footer />
                </section>
            </SidebarInset>

            <Feedback />
            {/* Toasts: rendered once by the root providers (AppToaster), not per page layout. */}
        </SidebarProvider>
    );
}

export default function HomeLayout({ children }) {
    return (
        <LayoutContent>
            {children}
        </LayoutContent>
    );
}
