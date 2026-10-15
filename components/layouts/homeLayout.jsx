'use client'
import Navbar from '@/components/ui/navbar';
import Dashboard from '@/components/ui/dashboard';
import Feedback from '@/components/ui/feedback';
import Footer from '@/components/ui/footer';
import AlertPush from '@/components/ui/alert';

import { SidebarInset, SidebarProvider } from '@/components/shadcn/sidebar';

import { useApp } from "@/contexts/appContext";

function LayoutContent({ children }) {
    const {
        isDashboard,
        setDashboard,
        alert,
        clearAlert
    } = useApp();

    return (
        <SidebarProvider
            open={isDashboard}
            onOpenChange={setDashboard}
            className="h-dvh min-h-0 overflow-hidden"
        >
            <Dashboard />

            <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
                <Navbar />

                <section id='container'>
                    {children}
                    <Footer />
                </section>
            </SidebarInset>

            <Feedback />

            <AlertPush
                status={alert?.status}
                message={alert?.message}
                reset={clearAlert}
                callback={alert?.callback}
            />
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
