import { createHash } from "node:crypto";

/**
 * Fingerprint of submitted code for the shared-solution report (services/expAudit.service.js):
 * sha256 of the code with every whitespace character removed, so re-indenting, reformatting or
 * changing line endings does not hide a copied solution.
 * shortcut: comments and identifier renames still change the hash; strip them per language if
 * copies that differ only there show up.
 */
export function normalizedCodeHash(code) {
    return createHash("sha256").update(String(code ?? "").replace(/\s+/g, "")).digest("hex");
}
