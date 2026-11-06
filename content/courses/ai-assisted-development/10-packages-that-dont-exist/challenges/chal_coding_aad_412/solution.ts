import { readFileSync } from "node:fs";

// CodeDev dependency check: an AI pull request added packages to package.json that do not exist,
// one that imitates a popular package, and one published last week by nobody anyone knows.
// Before `npm install` runs in CI, check every suggested dependency against a registry snapshot.
//
// checkDependencies(suggested, registry, policy, today) returns one finding per suggestion:
//   { name, range, status, detail }
//
// Checks, in this order (the first one that applies decides the status):
//   1. invalid      the name is not 1-214 characters of a-z 0-9 @ / . _ ~ -  (no uppercase, no spaces),
//                   or the range is not one of: "*", "x.y.z", "^x.y.z", "~x.y.z"  (detail "")
//   A package is popular when it is in the registry with weeklyDownloads >= policy.popularWeeklyDownloads.
//   Steps 2-4 are skipped for a name that is itself popular.
//   2. lookalike    the name is close to a popular package name (whether or not the name itself is in
//                   the registry). Normalize both names by removing every @ / . _ ~ - character, then
//                   take the Levenshtein distance (insert, delete, replace = 1 each) of the normalized
//                   forms. Close = distance <= 2, or <= 1 when the normalized popular name has 4
//                   characters or fewer ("@types-node" and "@types/node" are distance 0: close).
//                   detail = the popular name; several matches: the smallest distance, then the name
//                   that sorts first.
//   3. not_found    the name is not in the registry  (detail "")
//   4. new_low_downloads
//                   age < policy.newPackageDays AND weeklyDownloads < policy.minWeeklyDownloads, where
//                   age = whole days from the package's earliest publish date to today.
//                   detail = "<age> days, <weeklyDownloads>/week"
//   5. version_not_published
//                   no published version satisfies the range; detail = the highest published version
//   6. ok           detail = the highest published version that satisfies the range
//
// Ranges and versions: versions are "MAJOR.MINOR.PATCH" with whole numbers; compare them part by part
// as numbers (4.10.0 is higher than 4.9.0). "*" = any version. "x.y.z" = exactly that version.
// "~x.y.z" = at least x.y.z with the same major and minor. "^x.y.z" = at least x.y.z with the same
// major; when the major is 0, the same major and minor.
// Dates are "YYYY-MM-DD" (UTC). Every registry package has at least one version.
//
// Order of the findings: by status in the order lookalike, not_found, new_low_downloads,
// version_not_published, invalid, ok; then by name (compared with < and >); suggestions with the same
// status and name keep their input order.
//
// Do not change the types or the test runner.

type RegistryPackage = {
    weeklyDownloads: number;
    versions: Record<string, string>; // version -> publish date "YYYY-MM-DD", like `npm view <name> time`
};

type Policy = {
    popularWeeklyDownloads: number;
    newPackageDays: number;
    minWeeklyDownloads: number;
};

type Suggested = { name: string; range: string };

type Status = "lookalike" | "not_found" | "new_low_downloads" | "version_not_published" | "invalid" | "ok";

type Finding = { name: string; range: string; status: Status; detail: string };

const ORDER: Status[] = ["lookalike", "not_found", "new_low_downloads", "version_not_published", "invalid", "ok"];
const NAME = /^[a-z0-9@/._~-]{1,214}$/;
const RANGE = /^(\*|[~^]?\d+\.\d+\.\d+)$/;

function parse(version: string): number[] {
    return version.split(".").map(Number);
}

function compareVersions(a: string, b: string): number {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

function satisfies(version: string, range: string): boolean {
    // @piece range-match: Does a version fall inside the range
    if (range === "*") return true;
    const op = range[0] === "^" || range[0] === "~" ? range[0] : "";
    const base = op ? range.slice(1) : range;
    const [v, b] = [parse(version), parse(base)];
    if (op === "") return compareVersions(version, base) === 0;
    if (compareVersions(version, base) < 0) return false;
    if (op === "~" || b[0] === 0) return v[0] === b[0] && v[1] === b[1];
    return v[0] === b[0];
    // @end
}

function normalize(name: string): string {
    // @piece normalize: A name with its separators removed
    return name.replace(/[@/._~-]/g, "");
    // @end
}

function levenshtein(a: string, b: string): number {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

function daysBetween(from: string, to: string): number {
    return Math.floor((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

function checkDependencies(
    suggested: Suggested[],
    registry: Record<string, RegistryPackage>,
    policy: Policy,
    today: string,
): Finding[] {
    const popular = Object.keys(registry).filter((n) => registry[n].weeklyDownloads >= policy.popularWeeklyDownloads);

    const check = ({ name, range }: Suggested): Finding => {
        const result = (status: Status, detail = ""): Finding => ({ name, range, status, detail });
        if (!NAME.test(name) || !RANGE.test(range)) return result("invalid");
        const pkg = Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;

        if (!popular.includes(name)) {
            // @piece lookalike: Is the name close to a popular package
            const n = normalize(name);
            let best: { distance: number; name: string } | null = null;
            for (const p of popular) {
                const np = normalize(p);
                const distance = levenshtein(n, np);
                if (distance > (np.length <= 4 ? 1 : 2)) continue;
                if (!best || distance < best.distance || (distance === best.distance && p < best.name)) best = { distance, name: p };
            }
            if (best) return result("lookalike", best.name);
            // @end
            // @piece unknown-or-new: Unknown, or new and barely downloaded
            if (!pkg) return result("not_found");
            const first = Object.values(pkg.versions).sort()[0];
            const age = daysBetween(first, today);
            if (age < policy.newPackageDays && pkg.weeklyDownloads < policy.minWeeklyDownloads) {
                return result("new_low_downloads", `${age} days, ${pkg.weeklyDownloads}/week`);
            }
            // @end
        }

        // @piece versions: Is a published version inside the range
        const versions = Object.keys(pkg!.versions).sort(compareVersions);
        const matching = versions.filter((v) => satisfies(v, range));
        if (matching.length === 0) return result("version_not_published", versions[versions.length - 1]);
        return result("ok", matching[matching.length - 1]);
        // @end
    };

    // @piece report-order: The findings, riskiest first
    return suggested
        .map(check)
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    // @end
}

// ---------------------------------------------------------------- test runner (do not change)
type Input = { today: string; policy: Policy; registry: Record<string, RegistryPackage>; suggested: Suggested[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkDependencies(input.suggested, input.registry, input.policy, input.today)));
