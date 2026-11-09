/** Where content media goes: Cloudinary in production, the local Payload CMS otherwise. Node builtins and relative imports only. */
import { appEnv, isLocalUrl } from "../../lib/appEnv.mjs";

export function resolveMediaTarget(env) {
    if (appEnv(env) === "production") {
        for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
            if (!env[name]) throw new Error(`production media upload needs ${name}`);
        }
        return { provider: "cloudinary", manifestName: "assets.json", courseManifestName: "course.json" };
    }
    if (!env.PAYLOAD_URL || !env.PAYLOAD_API_KEY) throw new Error("non-production media upload needs PAYLOAD_URL and PAYLOAD_API_KEY");
    if (!isLocalUrl(env.PAYLOAD_URL)) throw new Error(`PAYLOAD_URL must point at a local CMS, got ${env.PAYLOAD_URL}`);
    return { provider: "payload", manifestName: "assets.local.json", courseManifestName: "course.local.json" };
}

/**
 * The target must come from the env file, not from a stray shell APP_ENV (dotenv never overrides the
 * shell). Only a forced `development` may differ: payload-sync sets it to keep the local target.
 * `processEnv` is process.env after loading, `fileEnv` the parsed env file (+ shared .env).
 */
export function checkAppEnvOverride(processEnv, fileEnv) {
    const running = appEnv(processEnv);
    const file = appEnv(fileEnv);
    if (running === file || running === "development") return;
    throw new Error(`APP_ENV from the shell (${running}) differs from the env file (${file}); unset APP_ENV or pick the matching --env file`);
}

const CHUNKED_VIDEO_BYTES = 20 * 1024 * 1024;

/** Starts a Cloudinary upload stream (SDK v2: options, callback); videos over 20 MB use the chunked API. */
export function cloudinaryUploadStream(uploader, { kind, size, options }, callback) {
    return kind === "video" && size > CHUNKED_VIDEO_BYTES
        ? uploader.upload_chunked_stream({ ...options, chunk_size: CHUNKED_VIDEO_BYTES }, callback)
        : uploader.upload_stream(options, callback);
}

export const needsUpload = (entry, checksum, { remoteExists }) => !entry || entry.checksum !== checksum || remoteExists === false;

export const mediaKey = ({ course, lesson, name }) => ["courses", course, lesson, name].filter(Boolean).join("/");

export const cloudinaryPublicId = (key) => `codedev/production/${key}`;

const formatOf = (mime) => String(mime || "").split("/")[1]?.replace(/\+.*/, "") || null;

/** Manifest entry for a Payload media doc (uploadToPayload result). */
export const payloadEntry = ({ key, doc, mime, checksum }) => ({
    key,
    url: doc.url,
    width: doc.width,
    height: doc.height,
    format: formatOf(doc.mimeType || mime),
    bytes: doc.filesize,
    checksum,
    provider: "payload",
    mime: doc.mimeType || mime,
});

/** Manifest entry for a Cloudinary upload result; `url` is the delivery URL, `mime` what that URL serves. */
export const cloudinaryEntry = ({ key, result, url, mime, checksum, video }) => ({
    key,
    publicId: result.public_id,
    url,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
    ...(video ? { duration: result.duration } : {}),
    checksum,
    provider: "cloudinary",
    mime,
});

/** Names present in both lists (a diagram and a video would share one key). */
export const duplicateNames = (imageFiles, videoFiles) => {
    const stem = (f) => f.replace(/\.[^.]+$/, "");
    const images = new Map(imageFiles.map((f) => [stem(f), f]));
    return videoFiles.filter((f) => images.has(stem(f))).map((f) => [images.get(stem(f)), f]);
};

/** Sets a top-level property in course.json text (2-space layout, LF or CRLF), keeping the hand-written formatting; the property line may or may not end in a comma. */
function setLine(text, key, value, anchor) {
    const own = new RegExp(`^  "${key}": .*?(,?)(\r?)$`, "m");
    if (own.test(text)) return text.replace(own, (_, comma, cr) => `  "${key}": ${value}${comma}${cr}`);
    const after = new RegExp(`^(  "${anchor}": .*?)(,?)(\r?)$`, "m");
    if (!after.test(text)) throw new Error(`course.json has no "${key}" or "${anchor}" line to edit`);
    return text.replace(after, (_, line, comma, cr) => `${line},${cr}\n  "${key}": ${value}${comma}${cr}`);
}

/** Writes `image` + `imageChecksum` (and `update.image` for an existing course) into course.json text. */
export function editCourseText(text, url, checksum) {
    const course = JSON.parse(text);
    let out = setLine(text, "image", JSON.stringify(url), "publicId");
    out = setLine(out, "imageChecksum", JSON.stringify(checksum), "image");
    if (course.existing) {
        // A multi-line update block that already has image: replace just that value.
        const nested = /^(  "update": \{\r?\n[\s\S]*?^    "image": )".*?"/m;
        if (nested.test(out) && !/^  "update": \{.*\}/m.test(out)) out = out.replace(nested, `$1${JSON.stringify(url)}`);
        else {
            const update = JSON.stringify({ ...(course.update || {}), image: url }).replace(/":/g, '": ').replace(/,"/g, ', "');
            out = setLine(out, "update", update.replace(/^\{/, "{ ").replace(/\}$/, " }"), "existing");
        }
    }
    const parsed = JSON.parse(out);
    if (parsed.image !== url || parsed.imageChecksum !== checksum || (course.existing && parsed.update?.image !== url)) throw new Error("could not write image to course.json");
    return out;
}
