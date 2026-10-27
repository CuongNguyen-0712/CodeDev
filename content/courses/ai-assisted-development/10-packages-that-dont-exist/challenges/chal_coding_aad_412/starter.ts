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

function checkDependencies(
    suggested: Suggested[],
    registry: Record<string, RegistryPackage>,
    policy: Policy,
    today: string,
): Finding[] {
    return suggested.map(({ name, range }) => ({ name, range, status: "ok", detail: "" }));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { today, policy, registry, suggested }. Output: the findings as JSON.
type Input = { today: string; policy: Policy; registry: Record<string, RegistryPackage>; suggested: Suggested[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkDependencies(input.suggested, input.registry, input.policy, input.today)));
