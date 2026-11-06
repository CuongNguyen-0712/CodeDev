// @piece script-rules: Which scripts exist and when one is blocked
const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare"];

const isGitDependency = (pkg: LockedPackage): boolean =>
    ["git+", "git://", "github:"].some((prefix) => pkg.resolved.startsWith(prefix));

// Blocked by default: a script runs only for an exact name + version + integrity match.
const blockReason = (pkg: LockedPackage, allowlist: AllowEntry[]): Reason | null => {
    if (isGitDependency(pkg)) return "git_dependency";
    const sameName = allowlist.filter((entry) => entry.name === pkg.name);
    if (sameName.length === 0) return "not_allowlisted";
    const sameVersion = sameName.filter((entry) => entry.version === pkg.version);
    if (sameVersion.length === 0) return "version_mismatch";
    if (!sameVersion.some((entry) => entry.integrity === pkg.integrity)) return "integrity_mismatch";
    return null;
};
