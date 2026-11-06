// @piece canonical-body: Write the manifest canonically
if (typeof m !== "object" || m === null) return null;
if (typeof m.release !== "string" || m.release === "" || /[\r\n]/.test(m.release)) return null;
if (typeof m.digests !== "object" || m.digests === null || Array.isArray(m.digests)) return null;
const names = Object.keys(m.digests);
if (names.length === 0) return null;
let out = `codedev-manifest-v1\nrelease:${m.release}\n`;
for (const name of names) {
    const digest = m.digests[name];
    if (!NAME.test(name) || typeof digest !== "string" || !HEX64.test(digest)) return null;
    out += `${name} sha256:${digest.toLowerCase()}\n`;
}
return out;
