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
    if (spec.startsWith("^") || spec.startsWith("~")) {
        const v = full(spec.slice(1));
        if (!v) return null;
        if (spec[0] === "~") return { lower: at(v), upper: at([v[0], v[1] + 1, 0], false) };
        const upper: V = v[0] > 0 ? [v[0] + 1, 0, 0] : v[1] > 0 ? [0, v[1] + 1, 0] : [0, 0, v[2] + 1];
        return { lower: at(v), upper: at(upper, false) };
    }
    if (/^[<>]/.test(spec)) {
        const parts = spec.split(/\s+/);
        if (parts.length > 2) return null;
        let lower: Bound = null;
        let upper: Bound = null;
        for (const part of parts) {
            const m = /^(>=|>|<=|<)(.*)$/.exec(part);
            const v = m ? full(m[2]) : null;
            if (!m || !v) return null;
            if (m[1].startsWith(">")) {
                if (lower) return null;
                lower = at(v, m[1] === ">=");
            } else {
                if (upper) return null;
                upper = at(v, m[1] === "<=");
            }
        }
        return { lower, upper };
    }
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
    const v = full(version);
    if (!v) return false; // prerelease or not a version
    if (range.lower) {
        const c = cmp(v, range.lower.v);
        if (c < 0 || (c === 0 && !range.lower.inclusive)) return false;
    }
    if (range.upper) {
        const c = cmp(v, range.upper.v);
        if (c > 0 || (c === 0 && !range.upper.inclusive)) return false;
    }
    return true;
}

function checkLockfile(manifest: Manifest, lock: Lockfile, policy: Policy): Finding[] {
    if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
        return [{ kind: "unsupported-lockfile", package: "package-lock.json", detail: `lockfileVersion ${lock.lockfileVersion ?? "missing"}` }];
    }
    const packages = lock.packages;
    if (!packages || typeof packages !== "object") {
        return [{ kind: "unsupported-lockfile", package: "package-lock.json", detail: "no packages map" }];
    }
    const findings: Finding[] = [];
    const specs = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, spec] of Object.entries(specs)) {
        const entry = packages[`node_modules/${name}`];
        const range = parseRange(spec);
        if (!range) findings.push({ kind: "wide-range", package: name, detail: `${spec} (not a version range)` });
        else if (!range.upper) findings.push({ kind: "wide-range", package: name, detail: `${spec} (no upper bound)` });
        if (!entry || typeof entry.version !== "string") {
            findings.push({ kind: "missing", package: name, detail: spec });
        } else if (range && range.upper && !satisfies(entry.version, range)) {
            findings.push({ kind: "mismatch", package: name, detail: `${spec} but locked ${entry.version}` });
        }
    }
    for (const [key, entry] of Object.entries(packages)) {
        if (!key.includes("node_modules/") || entry.link === true) continue;
        const name = key.replace(/^node_modules\//, "");
        const resolved = entry.resolved;
        if (typeof resolved !== "string" || !policy.allowedRegistries.some((r) => resolved.includes(r))) {
            findings.push({ kind: "registry", package: name, detail: typeof resolved === "string" ? resolved : "no resolved URL" });
        }
        if (typeof entry.integrity !== "string" || entry.integrity === "") {
            findings.push({ kind: "integrity", package: name, detail: "missing" });
        }
    }
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
