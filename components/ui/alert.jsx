'use client';
import { toast } from "sonner";

import { Toaster } from "@/components/shadcn/sonner";
import { userMessage } from "@/lib/userMessage";

/**
 * App-wide toasts (Sonner). `notify` is what useApp().showAlert(status, message, callback, options)
 * calls; `AppToaster` renders the one toast region and is mounted once, in the root providers.
 *
 * It must not live in a page layout: Sonner keeps active toasts in a module-level store and
 * replays them to every Toaster that mounts, and each toast restarts its timer when mounted. A
 * Toaster per layout was unmounted/remounted on every navigation, so a toast reappeared with a
 * full timeout after each page change and never expired while the user kept navigating.
 *
 * @param {number} status   200/201 success, 0 info, 500 error, anything else warning
 * @param {string} message
 * @param {{ callback?: Function, id?: string|number }} [options]
 *   `id`: a stable id for one event (e.g. a challenge or event id). Showing the same id again
 *   updates the toast in place instead of stacking a duplicate.
 */
export function notify(status, message, { callback, id } = {}) {
    if (typeof message !== 'string' || message.trim() === '') return undefined;
    // Last net for errors: a technical message (network, driver, framework) never reaches a toast.
    if (status !== 200 && status !== 201 && status !== 0) message = userMessage(message);

    const options = typeof callback === 'function'
        ? { action: { label: 'Continue', onClick: callback }, duration: 8000 }
        : { duration: 4000 };
    if (id !== undefined && id !== null) options.id = id;

    if (status === 200 || status === 201) return toast.success(message, options);
    if (status === 0) return toast.info(message, options);
    if (status === 500) return toast.error(message, options);
    return toast.warning(message, options);
}

export default function AppToaster() {
    return <Toaster position="bottom-right" closeButton />;
}
