import { readFileSync } from "node:fs";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// CodeDev deploy gate: deploy a release only if every artifact matches a signed manifest.
// The signature is simulated with HMAC-SHA256 and a test key (real pipelines sign with Sigstore/cosign
// or a KMS key and verify with a public key; the checks around the signature are the same).

type Artifact = { name: string; content: string };
type Manifest = { release: string; digests: Record<string, string>; signature: string };
type DeployRequest = { release: string; refs: string[] };
type Input = { key: string; artifacts: Artifact[]; manifest: Manifest; request: DeployRequest };

type Code =
    | "invalid-manifest"
    | "bad-signature"
    | "release-mismatch"
    | "empty-request"
    | "duplicate-artifact"
    | "unsigned-artifact"
    | "digest-mismatch"
    | "tag-reference"
    | "not-in-manifest"
    | "reference-mismatch"
    | "missing-artifact";
type Reason = { artifact: string; code: Code };
type Decision = { decision: "deploy" | "reject"; reasons: Reason[]; deployed: string[] };

const HEX64 = /^[0-9a-fA-F]{64}$/;
const NAME = /^[A-Za-z0-9._-]+$/;
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The exact bytes the release job signed. Returns null when the manifest cannot be written canonically. */
function canonicalManifest(m: Manifest): string | null {
    if (typeof m !== "object" || m === null) return null;
    if (typeof m.release !== "string" || m.release === "" || /[\r\n]/.test(m.release)) return null;
    if (typeof m.digests !== "object" || m.digests === null || Array.isArray(m.digests)) return null;
    const names = Object.keys(m.digests).sort(byString);
    if (names.length === 0) return null;
    let out = `codedev-manifest-v1\nrelease:${m.release}\n`;
    for (const name of names) {
        const digest = m.digests[name];
        if (!NAME.test(name) || typeof digest !== "string" || !HEX64.test(digest)) return null;
        out += `${name} sha256:${digest.toLowerCase()}\n`;
    }
    return out;
}

/** Constant-time check of a hex HMAC-SHA256 signature. */
function signatureValid(key: string, canonical: string, signature: unknown): boolean {
    if (typeof signature !== "string") return false;
    const expected = createHmac("sha256", key).update(canonical, "utf8").digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

const sha256Hex = (base64: string): string => createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

function verifyRelease(input: Input): Decision {
    const reject = (reasons: Reason[]): Decision => {
        const seen = new Set<string>();
        const unique = reasons.filter((r) => {
            const id = `${r.artifact}\u0000${r.code}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        unique.sort((a, b) => byString(a.artifact, b.artifact) || byString(a.code, b.code));
        return { decision: "reject", reasons: unique, deployed: [] };
    };

    const canonical = canonicalManifest(input.manifest);
    if (canonical === null) return reject([{ artifact: "", code: "invalid-manifest" }]);
    if (!signatureValid(input.key, canonical, input.manifest.signature)) return reject([{ artifact: "", code: "bad-signature" }]);

    // From here on the manifest is trusted.
    const signed = new Map(Object.entries(input.manifest.digests).map(([n, d]) => [n, d.toLowerCase()]));
    const reasons: Reason[] = [];
    if (input.request.release !== input.manifest.release) reasons.push({ artifact: "", code: "release-mismatch" });

    const count = new Map<string, number>();
    for (const a of input.artifacts) count.set(a.name, (count.get(a.name) ?? 0) + 1);
    for (const a of input.artifacts) {
        if ((count.get(a.name) ?? 0) > 1) reasons.push({ artifact: a.name, code: "duplicate-artifact" });
        else if (!signed.has(a.name)) reasons.push({ artifact: a.name, code: "unsigned-artifact" });
        else if (sha256Hex(a.content) !== signed.get(a.name)) reasons.push({ artifact: a.name, code: "digest-mismatch" });
    }

    if (input.request.refs.length === 0) reasons.push({ artifact: "", code: "empty-request" });
    const deployed = new Set<string>();
    for (const ref of input.request.refs) {
        const at = ref.indexOf("@sha256:");
        if (at < 0) {
            const colon = ref.lastIndexOf(":");
            reasons.push({ artifact: colon > 0 ? ref.slice(0, colon) : ref, code: "tag-reference" });
            continue;
        }
        const name = ref.slice(0, at);
        const digest = ref.slice(at + "@sha256:".length).toLowerCase();
        const want = signed.get(name);
        if (want === undefined) {
            reasons.push({ artifact: name, code: "not-in-manifest" });
            continue;
        }
        if (digest !== want) reasons.push({ artifact: name, code: "reference-mismatch" });
        if (!count.has(name)) reasons.push({ artifact: name, code: "missing-artifact" });
        deployed.add(`${name}@sha256:${want}`);
    }

    if (reasons.length) return reject(reasons);
    return { decision: "deploy", reasons: [], deployed: [...deployed].sort(byString) };
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
console.log(JSON.stringify(verifyRelease(input)));
