'use client';
import AlertPush from "@/components/ui/alert";
import Slider from "@/components/navigate/slider";

import { useApp } from "@/contexts/appContext";

function LayoutContent({ children }) {
    const { alert, clearAlert } = useApp();

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
        <LayoutContent>
            {children}
        </LayoutContent>
    );
}
