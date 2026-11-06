import { readFileSync } from "node:fs";

// CI lockfile check for the CodeDev web app: compare package.json with package-lock.json (v2/v3)
// before `npm ci` runs, and report every finding, sorted.
//
// Findings (kind, package, detail):
//   missing     a dependency of package.json has no "node_modules/<name>" entry with a version in the lock;
//               detail = the spec from package.json
//   wide-range  a spec the policy rejects; detail = `<spec> (no upper bound)` when it parses but has no
//               upper bound, `<spec> (not a version range)` when it is outside the subset below
//               (dist-tags such as "latest", git and URL specs, "||", hyphen ranges, partial ^/~ ...)
//   mismatch    the locked version does not satisfy the spec (only checked when the spec is not wide);
//               detail = `<spec> but locked <version>`
//   registry    a lock entry whose "resolved" does not start with one of policy.allowedRegistries
//               (missing resolved counts); detail = the resolved URL or "no resolved URL"
//   integrity   a lock entry with a missing or empty "integrity"; detail = "missing"
// registry and integrity look at every installed package: each key of "packages" that contains
// "node_modules/", except entries with link: true (workspace symlinks). Their package = the key without a
// leading "node_modules/" ("node_modules/express/node_modules/qs" -> "express/node_modules/qs").
//
// Range subset (spaces around the spec are ignored):
//   "", "*", "x", "X"                 any version (no upper bound)
//   1.2.3                             exactly that version
//   1.2 / 1.2.x / 1.2.*               >=1.2.0 <1.3.0
//   1 / 1.x / 1.x.x / 1.*             >=1.0.0 <2.0.0
//   ^1.2.3  ^0.2.3  ^0.0.3            <2.0.0, <0.3.0, <0.0.4 (first non-zero part may not change)
//   ~1.2.3                            >=1.2.3 <1.3.0
//   one or two comparators (>=, >, <=, <) with full versions, at most one lower and one upper bound
// Only plain MAJOR.MINOR.PATCH numbers are part of a range. A locked version with a prerelease
// ("2.0.0-rc.1") never satisfies a range of this subset (npm's default rule).
//
// Sort: by package (plain string order), then by kind in the order listed above.
// A lockfile whose lockfileVersion is not 2 or 3, or that has no "packages" object, gives exactly one
// finding: { kind: "unsupported-lockfile", package: "package-lock.json", detail: "lockfileVersion <value>" }
// ("lockfileVersion missing" when absent, "no packages map" when the version is fine but packages is missing).

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
type LockEntry = { version?: string; resolved?: string; integrity?: string; dev?: boolean; link?: boolean };
type Lockfile = { lockfileVersion?: number; packages?: Record<string, LockEntry> };
type Policy = { allowedRegistries: string[] };
type Kind = "missing" | "wide-range" | "mismatch" | "registry" | "integrity" | "unsupported-lockfile";
type Finding = { kind: Kind; package: string; detail: string };

type V = [number, number, number];
type Bound = { v: V; inclusive: boolean } | null;
type Range = { lower: Bound; upper: Bound };

const ORDER: Kind[] = ["missing", "wide-range", "mismatch", "registry", "integrity", "unsupported-lockfile"];

function cmp(a: V, b: V): number {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

function full(text: string): V | null {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const at = (v: V, inclusive = true): Bound => ({ v, inclusive });

function parseRange(raw: string): Range | null {
    const spec = raw.trim();
    if (spec === "" || spec === "*" || spec === "x" || spec === "X") return { lower: null, upper: null };
    // [ ] Caret and tilde ranges
    // [ ] Ranges written with comparators
    // exact, or partial with x / * wildcards: 1, 1.2, 1.x, 1.2.*, 1.x.x
    const m = /^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/.exec(spec);
    if (!m) return null;
    const wild = (s: string | undefined) => s === undefined || s === "x" || s === "X" || s === "*";
    const major = Number(m[1]);
    if (wild(m[2])) {
        if (!wild(m[3])) return null; // 1.x.3
        return { lower: at([major, 0, 0]), upper: at([major + 1, 0, 0], false) };
    }
    const minor = Number(m[2]);
    if (wild(m[3])) return { lower: at([major, minor, 0]), upper: at([major, minor + 1, 0], false) };
    const v: V = [major, minor, Number(m[3])];
    return { lower: at(v), upper: at(v) };
}

function satisfies(version: string, range: Range): boolean {
    // [ ] Is a locked version inside the range?
}

function checkLockfile(manifest: Manifest, lock: Lockfile, policy: Policy): Finding[] {
    // [ ] Refuse a lockfile of an unknown shape
    const findings: Finding[] = [];
    const specs = { ...manifest.dependencies, ...manifest.devDependencies };
    // [ ] Check every declared dependency
    // [ ] Check every installed entry
    return findings.sort((a, b) =>
        a.package < b.package ? -1 : a.package > b.package ? 1 : ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "packageJson": {...}, "lockfile": {...}, "policy": { "allowedRegistries": [...] } }.
// Prints one line per finding, in the order returned, then the number of findings.
const input: { packageJson: Manifest; lockfile: Lockfile; policy: Policy } = JSON.parse(readFileSync(0, "utf8"));
const findings = checkLockfile(input.packageJson, input.lockfile, input.policy);
for (const f of findings) console.log(`${f.kind} ${f.package}: ${f.detail}`);
console.log(`${findings.length} finding(s)`);
