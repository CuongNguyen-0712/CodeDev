'use client'
import Navbar from '../component/ui/navbar';
import Dashboard from '../component/ui/dashboard';
import Feedback from '../component/ui/feedback';
import Footer from '../component/ui/footer';
import Account from '../component/ui/account';

import AlertPush from '../component/ui/alert';

import { AppProvider, useApp } from "../contexts/appContext";

function LayoutContent({ children }) {
    const {
        isDashboard,
        setDashboard,
        isAccountMobile,
        setAccountMobile,
        alert,
        clearAlert,
    } = useApp();

    return (
        <main id='main'>
            <Navbar
                handleDashboard={setDashboard}
                handleAccountMobile={setAccountMobile}
            />

            <Dashboard
                isDashboard={isDashboard}
                handleDashboard={setDashboard}
            />

            <section id='container'>
                {children}
            </section>

            <Account
                isAccountMobile={isAccountMobile}
                handleAccountMobile={setAccountMobile}
            />

            <Feedback />

            <AlertPush
                status={alert?.status}
                message={alert?.message}
                reset={clearAlert}
                callback={alert?.callback}
            />

            <Footer />
        </main>
    );
}

export default function HomeLayout({ children }) {
    return (
        <AppProvider>
            <LayoutContent>
                {children}
            </LayoutContent>
        </AppProvider>
    );
}
