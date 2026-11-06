import { create } from "zustand";

import { AUTO_TIME_ZONE, resolveTimeZone, setDisplayTimeZone } from "@/lib/timeZone";

const STORAGE_KEY = "codedev_admin_time_zone";

/**
 * The time zone admin screens show dates and count days in. Naming and structure rules:
 * docs/state-management.md. Persist: localStorage STORAGE_KEY, "auto" or an IANA zone, this browser only.
 * Starts at UTC so the server render matches; hydrate() (admin shell, after mount) applies the choice.
 */
export const useAdminTimeZoneStore = create((set) => ({
    choice: AUTO_TIME_ZONE,
    zone: "UTC",
    // False until hydrate(): zone-dependent queries wait, so they are not fetched once in UTC first.
    ready: false,

    setChoice: (choice) => {
        const zone = resolveTimeZone(choice);
        try {
            localStorage.setItem(STORAGE_KEY, choice === AUTO_TIME_ZONE ? AUTO_TIME_ZONE : zone);
        } catch {
            // Unwritable storage still applies the zone for this visit.
        }
        setDisplayTimeZone(zone);
        set({ choice: choice === AUTO_TIME_ZONE ? AUTO_TIME_ZONE : zone, zone, ready: true });
    },

    hydrate: () => {
        let choice = AUTO_TIME_ZONE;
        try {
            choice = localStorage.getItem(STORAGE_KEY) || AUTO_TIME_ZONE;
        } catch {
            // Unreadable storage follows the device.
        }
        const zone = resolveTimeZone(choice);
        setDisplayTimeZone(zone);
        set({ choice: choice === AUTO_TIME_ZONE ? AUTO_TIME_ZONE : zone, zone, ready: true });
    },
}));
