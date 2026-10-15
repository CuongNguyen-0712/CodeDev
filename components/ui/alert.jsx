'use client';
import { useEffect } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/shadcn/sonner";

// Bridges the app-wide showAlert(status, message, callback) API onto Sonner,
// so every screen gets one accessible (aria-live) toast system.
function notify(status, message, callback) {
    const options = typeof callback === 'function'
        ? { action: { label: 'Continue', onClick: callback }, duration: 8000 }
        : { duration: 4000 };

    if (status === 200 || status === 201) return toast.success(message, options);
    if (status === 0) return toast.info(message, options);
    if (status === 500) return toast.error(message, options);
    return toast.warning(message, options);
}

export default function AlertPush({ status = 0, message = '', callback = null, reset }) {
    useEffect(() => {
        if (!message || message.trim() === '') return;
        notify(status, message, callback);
        reset?.();
    }, [message, status, callback]);

    return <Toaster position="bottom-right" closeButton />;
}
