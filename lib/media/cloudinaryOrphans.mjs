// Pure helpers for scripts/cloudinary-cleanup.mjs: no I/O, node builtins only.
const DEV_PREFIXES = ["codedev/development/", "codedev/test/"];
const SOURCES = ["manifests", "covers", "dbKeys"];

export const devAssets = (assets) => assets.filter((a) => DEV_PREFIXES.some((p) => a.publicId.startsWith(p)));

// Public id from a Cloudinary delivery URL; null for anything else.
export function coverPublicId(url) {
    if (typeof url !== "string") return null;
    let u;
    try {
        u = new URL(url);
    } catch {
        return null;
    }
    if (u.hostname !== "res.cloudinary.com") return null;
    const m = u.pathname.match(/^\/[^/]+\/(?:image|video|raw)\/upload\/(.+)$/);
    if (!m) return null;
    let segs = m[1].split("/");
    const v = segs.findIndex((s) => /^v\d+$/.test(s));
    // shortcut: without a version segment, transformation segments are told apart by the `x_` / `x_a,y_b` shape.
    segs = v >= 0 ? segs.slice(v + 1) : segs.filter((s, i, all) => i === all.length - 1 || !/^[a-z]{1,3}_[^/]*$/.test(s));
    const last = segs.length - 1;
    if (last < 0) return null;
    segs[last] = segs[last].replace(/\.[A-Za-z0-9]+$/, "");
    return decodeURIComponent(segs.join("/")) || null;
}

export function findOrphans({ assets, referenced }) {
    for (const name of SOURCES) if (!referenced?.[name]) throw new Error(`reference source missing: ${name}`);
    const refs = SOURCES.map((n) => referenced[n]);
    const keep = [];
    const orphans = [];
    for (const a of assets) {
        // Anything outside codedev/ is never ours to delete.
        if (!a.publicId.startsWith("codedev/") || refs.some((s) => s.has(a.publicId))) keep.push(a);
        else orphans.push(a);
    }
    return { keep, orphans };
}
