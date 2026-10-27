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

/** The exact string the release job signed, or null when the manifest cannot be written canonically. */
function canonicalManifest(m: Manifest): string | null {
    return null;
}

/** true when signature is the hex HMAC-SHA256 of canonical with key, compared in constant time. */
function signatureValid(key: string, canonical: string, signature: unknown): boolean {
    return false;
}

function verifyRelease(input: Input): Decision {
    return { decision: "deploy", reasons: [], deployed: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
console.log(JSON.stringify(verifyRelease(input)));
