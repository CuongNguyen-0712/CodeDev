'use client';
import { AppProvider, useApp } from "../contexts/appContext";

import AlertPush from "../component/ui/alert";

function LayoutContent({ children }) {
    const { alert, clearAlert } = useApp();

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
        <AppProvider>
            <LayoutContent>
                {children}
            </LayoutContent>
        </AppProvider>
    );
}
