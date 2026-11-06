// Time zones for the admin screens: "auto" follows the viewer's device, or an IANA zone they picked.
// The resolved zone is kept here as module state so the plain format helpers can read it.

export const AUTO_TIME_ZONE = "auto";

/** True for a zone name Intl knows ("Asia/Ho_Chi_Minh", "UTC"); short, so it is safe in a cache key. */
export function isTimeZone(value) {
    if (typeof value !== "string" || !value || value.length > 64) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

/** The device's zone, or UTC where Intl cannot tell. */
export function deviceTimeZone() {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isTimeZone(zone) ? zone : "UTC";
    } catch {
        return "UTC";
    }
}

/** "auto", an unknown or an empty choice all mean the device's zone. */
export const resolveTimeZone = (choice) => (choice && choice !== AUTO_TIME_ZONE && isTimeZone(choice) ? choice : deviceTimeZone());

/** Every zone the runtime knows, UTC included (older runtimes without supportedValuesOf get UTC only). */
export function timeZoneOptions() {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** "GMT+7", "GMT" for a zone at a moment. */
export function offsetLabel(zone, date = new Date()) {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value || zone;
    } catch {
        return zone;
    }
}

// UTC until the admin shell resolves the viewer's choice after mount, so the server render matches.
let displayTimeZone = "UTC";
export const getDisplayTimeZone = () => displayTimeZone;
export function setDisplayTimeZone(zone) {
    displayTimeZone = isTimeZone(zone) ? zone : "UTC";
}
