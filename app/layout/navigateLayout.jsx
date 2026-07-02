'use client';
import { Suspense } from "react";

import AlertPush from "../component/ui/alert";
import Slider from "../component/navigate/slider";

import { LoadingRedirect } from "../component/ui/loading";

import { AppProvider, useApp } from "../contexts/appContext";

function LayoutContent({ children }) {
    const { redirect, alert, clearAlert } = useApp();

    if (redirect) {
        return <LoadingRedirect />
    }

    return (
        <div className="navigate_layout">
            <Slider />
            <AlertPush
                message={alert?.message}
                status={alert?.status}
                reset={clearAlert}
                callback={alert?.callback}
            />
            <div className="main_content">
                {children}
            </div>
        </div>
    )
}

export default function NavigateLayout({ children }) {
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
