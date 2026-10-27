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

// Write checkLockfile (helpers such as parseRange and satisfies are welcome).
// Do not change the types or the test runner.
function checkLockfile(manifest: Manifest, lock: Lockfile, policy: Policy): Finding[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "packageJson": {...}, "lockfile": {...}, "policy": { "allowedRegistries": [...] } }.
// Prints one line per finding, in the order returned, then the number of findings.
const input: { packageJson: Manifest; lockfile: Lockfile; policy: Policy } = JSON.parse(readFileSync(0, "utf8"));
const findings = checkLockfile(input.packageJson, input.lockfile, input.policy);
for (const f of findings) console.log(`${f.kind} ${f.package}: ${f.detail}`);
console.log(`${findings.length} finding(s)`);
