'use client';
import { useApp } from "@/contexts/appContext";

import AlertPush from "@/components/ui/alert";

function LayoutContent({ children }) {
    const { alert, clearAlert } = useApp();

    return (
        <section className='default_layout'>
            {children}
            <AlertPush
                message={alert?.message}
                status={alert?.status}
                reset={clearAlert}
                callback={alert?.callback}
            />
        </section>
    )
}

export default function DefaultLayout({ children }) {
    return (
        <LayoutContent>
            {children}
        </LayoutContent>
    );
}
