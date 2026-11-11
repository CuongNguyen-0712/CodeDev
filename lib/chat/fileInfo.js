import { FILE_TYPES } from "@/lib/chat/limits";

/** Lowercased extension of a file name, "" when there is none. */
export const extensionOf = (name) => (String(name).includes(".") ? String(name).split(".").pop().toLowerCase() : "");

/** True when the name's extension is an allowed file type (own keys only: "constructor" is not one). */
export const isAllowedFile = (name) => Object.hasOwn(FILE_TYPES, extensionOf(name));

/** Base 1000, like MAX_FILE_BYTES: "NN KB" (at least 1) below 1 MB, "N.N MB" from 1 MB. */
export function formatFileSize(bytes) {
    if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
