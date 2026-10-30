import { readFileSync } from "node:fs";

// CodeDev lockfile check: run in CI before `npm ci`, on package.json and package-lock.json (v3).
//
// checkLockfile(manifest, lockPackages) looks at every DIRECT dependency, from both
// manifest.dependencies and manifest.devDependencies (either map may be missing; a name appears in
// at most one of them), and returns one Finding per problem:
//
//   "non_registry_source"  the spec contains ":" or "/" (git+https://..., github:owner/repo,
//                          owner/repo#tag, file:../lib, https://host/pkg.tgz). Registry ranges never do.
//   "unbounded_range"      a registry spec that is, after trimming, "", "*", "x", "X" or "latest",
//                          or that starts with ">" and contains no "<" (">=2.0.0", ">1.0.0").
//   "not_locked"           lockPackages has no key exactly "node_modules/<name>". Nested keys such as
//                          "node_modules/next/node_modules/<name>" belong to someone else's dependency.
//                          When the entry is missing, no lock checks below run for this dependency.
//   For registry specs (not "non_registry_source") with a lock entry:
//   "lock_mismatch"        the spec is exact "1.2.3", "^1.2.3" or "~1.2.3" and entry.version does not
//                          satisfy it (other range forms are not checked):
//                            exact  -> the same version
//                            ~X.Y.Z -> >= X.Y.Z and < X.(Y+1).0
//                            ^X.Y.Z -> X > 0:           >= X.Y.Z and < (X+1).0.0
//                                      X = 0, Y > 0:    >= 0.Y.Z and < 0.(Y+1).0
//                                      X = 0, Y = 0:    exactly 0.0.Z
//   "untrusted_resolved"   entry.resolved is missing, not a valid URL, not https:, or its host is not
//                          exactly "registry.npmjs.org".
//   "missing_integrity"    entry.integrity is missing or an empty string.
//
// All versions in the fixtures are plain MAJOR.MINOR.PATCH numbers.
// Sort the findings by package name, then by rule name (plain string comparison, not localeCompare).
// A missing lockPackages is treated as an empty object.

interface Manifest {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface LockEntry {
    version?: string;
    resolved?: string;
    integrity?: string;
}

type Rule =
    | "non_registry_source"
    | "unbounded_range"
    | "not_locked"
    | "lock_mismatch"
    | "untrusted_resolved"
    | "missing_integrity";

interface Finding {
    package: string;
    rule: Rule;
}

type Version = [number, number, number];

function parseVersion(text: string): Version | null {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: Version, b: Version): number {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

// true / false for the supported forms, null when the spec is not exact, ^ or ~
function satisfies(version: string, spec: string): boolean | null {
    const m = /^([\^~]?)(\d+\.\d+\.\d+)$/.exec(spec.trim());
    if (!m) return null;
    const base = parseVersion(m[2]) as Version;
    const v = parseVersion(version);
    if (!v) return false;
    if (m[1] === "") return compare(v, base) === 0;
    let upper: Version;
    if (m[1] === "~") upper = [base[0], base[1] + 1, 0];
    else if (base[0] > 0) upper = [base[0] + 1, 0, 0];
    else if (base[1] > 0) upper = [0, base[1] + 1, 0];
    else upper = [0, 0, base[2] + 1];
    return compare(v, base) >= 0 && compare(v, upper) < 0;
}

function isUnbounded(spec: string): boolean {
    const s = spec.trim();
    if (["", "*", "x", "X", "latest"].includes(s)) return true;
    return s.startsWith(">") && !s.includes("<");
}

function trustedResolved(resolved: string | undefined): boolean {
    if (typeof resolved !== "string") return false;
    try {
        const url = new URL(resolved);
        return url.protocol === "https:" && url.hostname === "registry.npmjs.org";
    } catch {
        return false;
    }
}

function checkLockfile(manifest: Manifest, lockPackages: Record<string, LockEntry>): Finding[] {
    const findings: Finding[] = [];
    const direct = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
    for (const [name, spec] of Object.entries(direct)) {
        const add = (rule: Rule) => findings.push({ package: name, rule });
        const nonRegistry = spec.includes(":") || spec.includes("/");
        if (nonRegistry) add("non_registry_source");
        else if (isUnbounded(spec)) add("unbounded_range");
        const entry = lockPackages[`node_modules/${name}`];
        if (!entry) {
            add("not_locked");
            continue;
        }
        if (nonRegistry) continue;
        if (satisfies(entry.version ?? "", spec) === false) add("lock_mismatch");
        if (!trustedResolved(entry.resolved)) add("untrusted_resolved");
        if (typeof entry.integrity !== "string" || entry.integrity === "") add("missing_integrity");
    }
    return findings.sort((a, b) =>
        a.package !== b.package ? (a.package < b.package ? -1 : 1) : a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0,
    );
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { packageJson?: Manifest; lockPackages?: Record<string, LockEntry> } = JSON.parse(readFileSync(0, "utf8"));
const result: Finding[] = checkLockfile(input.packageJson ?? {}, input.lockPackages ?? {});
console.log(JSON.stringify(result));
