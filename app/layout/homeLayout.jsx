'use client'
import { Suspense } from 'react';

import Navbar from '../component/home/navbar';
import Dashboard from '../component/home/dashboard';
import Feedback from '../component/home/feedback';
import Footer from '../component/ui/footer';


import { LoadingRedirect } from '@/app/component/ui/loading';

import AlertPush from '../component/ui/alert';

import { AppProvider, useApp } from "../contexts/appContext";

function LayoutContent({ children }) {
    const {
        dashboard,
        setDashboard,
        redirect,
        setRedirect,
        alert,
        clearAlert
    } = useApp();

    if (redirect) {
        return <LoadingRedirect />
    }

    return (
        <main id='main'>
            <Navbar
                handleDashboard={setDashboard}
                redirect={setRedirect}
            />

            <Dashboard
                isDashboard={dashboard}
                handleDashboard={setDashboard}
                redirect={setRedirect}
            />

            <section id='container'>
                {children}
            </section>

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
        <Suspense fallback={<LoadingRedirect />}>
            <AppProvider>
                <LayoutContent>
                    {children}
                </LayoutContent>
            </AppProvider>
        </Suspense>
    );
}
