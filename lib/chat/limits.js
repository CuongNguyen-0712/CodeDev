export const MAX_BODY = 4000;
export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 5_000_000;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_BYTES = 15_000_000;
export const FILE_TYPES = {
    pdf: "application/pdf", txt: "text/plain", js: "text/plain", ts: "text/plain", jsx: "text/plain", tsx: "text/plain",
    py: "text/plain", java: "text/plain", c: "text/plain", cpp: "text/plain", h: "text/plain", go: "text/plain",
    rs: "text/plain", sql: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", zip: "application/zip",
};
// For <input accept>: image MIME types first, then every allowed extension.
export const ATTACHMENT_ACCEPT = [...IMAGE_TYPES, ...Object.keys(FILE_TYPES).map((e) => `.${e}`)].join(",");
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_PAGE = 30;
export const INBOX_PAGE = 20;
export const INLINE_PAYLOAD_BYTES = 8000;
export const TYPING_THROTTLE_MS = 3000;
export const TYPING_SHOW_MS = 5000;
export const READ_DEBOUNCE_MS = 1000;
export const ORPHAN_MAX_AGE_MINUTES = 60;
export const ORPHAN_BATCH = 500;
export const PUSH_PREVIEW_CHARS = 80;
