'use client';

import { Suspense } from "react";

import { AppProvider, useApp } from "../contexts/appContext";

import AlertPush from "../component/ui/alert";

import { LoadingRedirect } from "../component/ui/loading";

function LayoutContent({ children }) {
    const { redirect, alert, clearAlert } = useApp();

    if (redirect) {
        return <LoadingRedirect />
    }

    return (
        <>
            {children}
            <AlertPush
                message={alert?.message}
                status={alert?.status}
                reset={clearAlert}
                callback={alert?.callback}
            />
        </>
    )
}

export default function DefaultLayout({ children }) {

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
