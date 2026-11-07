'use client';

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { disableWebPush, enableWebPush, webPushState } from "@/lib/beamsClient";

import { Label } from "@/components/shadcn/label";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Switch } from "@/components/shadcn/switch";

const COPY = {
    unsupported: "Not supported on this browser.",
    blocked: "Blocked in your browser settings.",
    on: "On: this device shows a notification when CodeDev is not open.",
    off: "Off: new notifications only appear in your inbox.",
};

const ID = "web-push";

// Per device, not per account: the choice lives in this browser (lib/beamsClient), so the switch
// reads it after mount instead of from the server.
export default function WebPushSection() {
    const { data: session } = useSession();
    const { showAlert } = useApp();
    const userId = session?.user?.id ?? null;

    const [state, setState] = useState(null);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (userId) setState(webPushState(userId));
    }, [userId]);

    const toggle = async (on) => {
        setPending(true);
        try {
            if (on) await enableWebPush(userId);
            else await disableWebPush(userId);
        } catch {
            showAlert(500, on ? "Could not turn on browser notifications" : "Could not turn off browser notifications");
        } finally {
            setState(webPushState(userId));
            setPending(false);
        }
    };

    if (state === null) {
        return (
            <div className="p-4" role="status" aria-busy="true" aria-label="Loading browser notifications">
                <Skeleton className="h-12 w-full" />
            </div>
        );
    }

    const locked = state === "unsupported" || state === "blocked";

    return (
        <ul className="m-0 list-none divide-y p-0">
            <li className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={ID} className="text-sm font-medium">Notifications on this device</Label>
                    <p id={`${ID}-description`} className="text-xs text-muted-foreground" aria-live="polite">
                        {COPY[state]}
                    </p>
                </div>
                <Switch
                    id={ID}
                    checked={state === "on"}
                    onCheckedChange={toggle}
                    disabled={locked || pending}
                    aria-describedby={`${ID}-description`}
                    className="mt-0.5 shrink-0"
                />
            </li>
        </ul>
    );
}
