// Shared (server + browser) helpers for grading coding challenge outputs.

export function parseJsonSafe(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== "string") return value;

    try {
        return JSON.parse(value);
    } catch {
        // Plain-text expected outputs are compared as strings.
        return value;
    }
}

// Normalises values to what JSON can represent (undefined -> null, drops functions).
export function toJsonValue(value) {
    if (value === undefined) return null;

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

export function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;

    if (typeof a === "number") {
        return Number.isNaN(a) && Number.isNaN(b);
    }

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((item, index) => deepEqual(item, b[index]));
    }

    if (typeof a === "object") {
        if (Array.isArray(b)) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
    }

    return false;
}

export function outputsMatch(actual, expected) {
    return deepEqual(toJsonValue(actual), toJsonValue(parseJsonSafe(expected)));
}
