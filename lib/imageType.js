/**
 * Detects the real image type from the file's first bytes. The browser-supplied `File.type` is
 * only a hint from the client and is never trusted. SVG is deliberately not accepted (it can
 * carry script).
 */
const SIGNATURES = [
    { mime: "image/jpeg", format: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: "image/png", format: "png", test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
    { mime: "image/gif", format: "gif", test: (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a" },
    { mime: "image/webp", format: "webp", test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
];

function ascii(bytes, start, end) {
    return String.fromCharCode(...bytes.subarray(start, end));
}

/** @returns {{ mime: string, format: string } | null} */
export function detectImageType(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 12) return null;
    const match = SIGNATURES.find((signature) => signature.test(bytes));
    return match ? { mime: match.mime, format: match.format } : null;
}

export const ACCEPTED_IMAGE_FORMATS = SIGNATURES.map((signature) => signature.format);
export const ACCEPTED_IMAGE_MIME = SIGNATURES.map((signature) => signature.mime);
