import { readFileSync } from "node:fs";

// An automated review checklist for pull requests on the CodeDev API repository.
// It runs on every PR (AI-generated or not) before a human reviewer opens it, and it reports
// five checks, always in this order:
//   "tests"         source changed, but no test file changed
//   "dependencies"  a dependency that is new in package.json and not on the allowlist
//   "debug_markers" TODO, FIXME or console.log( in an added line
//   "paths"         a changed file outside the allowed paths
//   "size"          a very large PR
// Each result is { check, passed, details }: passed is true when details is empty, and details
// is sorted (default string order) without duplicates. The exact rules are in the challenge
// description.

type ChangedFile = {
    path: string;
    status: "added" | "modified" | "removed" | "renamed";
    additions: number;
    deletions: number;
    addedLines: string[];
};
type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
type PullRequest = {
    files: ChangedFile[];
    packageJson: { before: Manifest; after: Manifest };
    policy: { knownDependencies: string[]; allowedPaths: string[]; maxChangedLines: number };
};
type CheckName = "tests" | "dependencies" | "debug_markers" | "paths" | "size";
type CheckResult = { check: CheckName; passed: boolean; details: string[] };

const MARKERS = ["TODO", "FIXME", "console.log("];
const LOCK_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function fileName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

function isTestFile(path: string): boolean {
    // @piece test-file: Is a changed file a test file
    const segments = path.split("/");
    const name = segments[segments.length - 1];
    const folders = segments.slice(0, -1);
    return name.includes(".test.") || name.includes(".spec.")
        || folders.some((f) => f === "test" || f === "tests" || f === "__tests__");
    // @end
}

function isSourceFile(path: string): boolean {
    return path.startsWith("src/") && SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))
        && !path.endsWith(".d.ts") && !isTestFile(path);
}

function isAllowed(path: string, allowedPaths: string[]): boolean {
    // @piece allowed: Is a path covered by the allowed list
    return allowedPaths.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
    // @end
}

function dependencyNames(manifest: Manifest): Set<string> {
    // @piece dependency-names: Every dependency the manifest declares
    return new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
    // @end
}

function result(check: CheckName, details: string[]): CheckResult {
    const sorted = [...new Set(details)].sort();
    return { check, passed: sorted.length === 0, details: sorted };
}

function reviewChecklist(pr: PullRequest): CheckResult[] {
    // @piece tests-and-deps: Untested source changes and new dependencies
    const present = pr.files.filter((f) => f.status !== "removed");

    const sources = present.filter((f) => isSourceFile(f.path)).map((f) => f.path);
    const testsChanged = present.some((f) => isTestFile(f.path));

    const before = dependencyNames(pr.packageJson.before);
    const known = new Set(pr.policy.knownDependencies);
    const unknown = [...dependencyNames(pr.packageJson.after)].filter((name) => !before.has(name) && !known.has(name));
    // @end

    // @piece markers: Debug markers in added lines
    const markers: string[] = [];
    for (const file of present) {
        for (const marker of MARKERS) {
            if (file.addedLines.some((line) => line.includes(marker))) markers.push(`${file.path}: ${marker}`);
        }
    }
    // @end

    // @piece paths-and-size: Paths outside the allowed list, and the PR size
    const outside = pr.files.filter((f) => !isAllowed(f.path, pr.policy.allowedPaths)).map((f) => f.path);

    const total = pr.files
        .filter((f) => !LOCK_FILES.has(fileName(f.path)))
        .reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const max = pr.policy.maxChangedLines;
    // @end

    return [
        result("tests", sources.length > 0 && !testsChanged ? sources : []),
        result("dependencies", unknown),
        result("debug_markers", markers),
        result("paths", outside),
        result("size", total > max ? [`${total} changed lines, limit ${max}`] : []),
    ];
}

// ---------------------------------------------------------------- test runner (do not change)
const pr: PullRequest = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(reviewChecklist(pr)));
