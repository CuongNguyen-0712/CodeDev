'use client'
import Navbar from '@/components/ui/navbar';
import Dashboard from '@/components/ui/dashboard';
import Feedback from '@/components/ui/feedback';
import Footer from '@/components/ui/footer';
import Account from '@/components/ui/account';

import AlertPush from '@/components/ui/alert';

import { useApp } from "@/contexts/appContext";

function LayoutContent({ children }) {
    const {
        isDashboard,
        setDashboard,
        isAccountMobile,
        setAccountMobile,
        alert,
        showAlert,
        clearAlert
    } = useApp();

    return (
        <>
            <Dashboard
                isDashboard={isDashboard}
                handleDashboard={setDashboard}
            />

            <main id='main'>
                <Navbar
                    isDashboard={isDashboard}
                    handleDashboard={setDashboard}
                    handleAccountMobile={setAccountMobile}
                />

                <section id='container'>
                    {children}
                    <Footer />
                </section>
            </main>

            <Account
                isAccountMobile={isAccountMobile}
                handleAccountMobile={setAccountMobile}
                alert={showAlert}
            />

            <Feedback />

            <AlertPush
                status={alert?.status}
                message={alert?.message}
                reset={clearAlert}
                callback={alert?.callback}
            />

        </>
    );
}

export default function HomeLayout({ children }) {
    return (
        <LayoutContent>
            {children}
        </LayoutContent>
    );
}
