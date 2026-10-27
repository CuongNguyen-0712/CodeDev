import { readFileSync } from "node:fs";

// Spot the AI Mistake: install scripts allowed by default.
//
// The request to the AI assistant: "make the CI install step faster and stop the native module
// build failing". The build had started failing after sharp was added: CI ran
// `npm ci --ignore-scripts` and then `npm rebuild` only for the packages that planInstallScripts
// put in `run`, and sharp was not on the reviewed allowlist yet. The assistant merged the two steps
// into `npm ci --foreground-scripts --unsafe-perm` (the team has reverted that line) and rewrote
// planInstallScripts below. The build is green again.
//
// planInstallScripts(lock, allowlist) decides, for every package in the lockfile, which of its
// lifecycle scripts CI runs (`npm rebuild` of those packages) and which it blocks and reports.
// The rules it must follow (CodeDev's install policy):
//
//   Scripts that count, when present with a non-empty value:
//     registry packages   preinstall, install, postinstall
//     git dependencies    preinstall, install, postinstall, prepare   (npm runs prepare when it
//                         builds a package from git; it never runs prepare of a registry package)
//     A package is a git dependency when `resolved` starts with "git+", "git://" or "github:".
//   A script runs only when the package is on the allowlist with the same name, the same version
//   and the same integrity (a non-empty string). Everything else is blocked by default, with the
//   first reason that applies:
//     "git_dependency"      the package is a git dependency (it has no registry integrity to pin)
//     "not_allowlisted"     no allowlist entry has this name
//     "version_mismatch"    entries for this name exist, none with this exact version
//                           (an entry with a range such as "^0.25.0" matches no version)
//     "integrity_mismatch"  an entry has this name and version, but no such entry has the
//                           package's integrity, or the integrity is ""
//   Order: packages in lockfile order; for each package its scripts in the order
//   preinstall, install, postinstall, prepare. package = "<name>@<version>".
//
// Do not change the types or the test runner.

type LockedPackage = {
    name: string;
    version: string;
    resolved: string; // registry tarball URL, or "git+ssh://git@github.com/<org>/<repo>.git#<commit>"
    integrity: string; // "sha512-..." for registry packages, "" for git dependencies
    scripts: Record<string, string>; // the "scripts" of the package's own package.json
};

type AllowEntry = { name: string; version: string; integrity: string; reviewedBy: string };

type Reason = "git_dependency" | "not_allowlisted" | "version_mismatch" | "integrity_mismatch";

type Plan = {
    run: { package: string; script: string }[];
    blocked: { package: string; script: string; reason: Reason }[];
};

const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare"];

function isGitDependency(pkg: LockedPackage): boolean {
    return ["git+", "git://", "github:"].some((prefix) => pkg.resolved.startsWith(prefix));
}

// Blocked by default: a script runs only for an exact name + version + integrity match.
function blockReason(pkg: LockedPackage, allowlist: AllowEntry[]): Reason | null {
    if (isGitDependency(pkg)) return "git_dependency";
    const sameName = allowlist.filter((entry) => entry.name === pkg.name);
    if (sameName.length === 0) return "not_allowlisted";
    const sameVersion = sameName.filter((entry) => entry.version === pkg.version);
    if (sameVersion.length === 0) return "version_mismatch";
    if (pkg.integrity === "" || !sameVersion.some((entry) => entry.integrity === pkg.integrity)) return "integrity_mismatch";
    return null;
}

function planInstallScripts(lock: LockedPackage[], allowlist: AllowEntry[]): Plan {
    const plan: Plan = { run: [], blocked: [] };
    for (const pkg of lock) {
        const git = isGitDependency(pkg);
        const reason = blockReason(pkg, allowlist);
        for (const script of LIFECYCLE) {
            if (!pkg.scripts[script]) continue;
            
            const id = `${pkg.name}@${pkg.version}`;
            if (reason === null) plan.run.push({ package: id, script });
            else plan.blocked.push({ package: id, script, reason });
        }
    }
    return plan;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { lock, allowlist }. Output: the plan as JSON.
type Input = { lock: LockedPackage[]; allowlist: AllowEntry[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(planInstallScripts(input.lock, input.allowlist)));
