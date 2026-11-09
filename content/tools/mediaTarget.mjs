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

export const needsUpload = (entry, checksum, { remoteExists }) => !entry || entry.checksum !== checksum || remoteExists === false;

export const mediaKey = ({ course, lesson, name }) => ["courses", course, lesson, name].filter(Boolean).join("/");

export const cloudinaryPublicId = (key) => `codedev/production/${key}`;
