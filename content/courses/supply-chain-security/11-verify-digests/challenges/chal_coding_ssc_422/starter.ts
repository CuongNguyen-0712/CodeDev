import { readFileSync } from "node:fs";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// CodeDev deploy gate: deploy a release only if every artifact matches a signed manifest.
// The signature is simulated with HMAC-SHA256 and a test key (real pipelines sign with Sigstore/cosign
// or a KMS key and verify with a public key; the checks around the signature are the same).
//
// Order of the checks (the challenge text has the exact rules and reason codes):
// 1. Build the canonical manifest string. Cannot be built -> reject with "invalid-manifest" only.
// 2. Verify the HMAC signature over it with a constant-time comparison -> "bad-signature" only.
// 3. Only now trust the digests: check the release, every artifact in the bundle and every ref.
// Do not change the types or the test runner.

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
    // [ ] Write the manifest canonically
}

/** Constant-time check of a hex HMAC-SHA256 signature. */
function signatureValid(key: string, canonical: string, signature: unknown): boolean {
    // [ ] Check the signature in constant time
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
    // [ ] Trust the signed digests, check the release

    // [ ] Check every artifact in the bundle

    // [ ] Check every requested reference

    // [ ] Reject with the reasons, or deploy
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
console.log(JSON.stringify(verifyRelease(input)));
