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
    // [ ] Is a changed file a test file
}

function isSourceFile(path: string): boolean {
    return path.startsWith("src/") && SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))
        && !path.endsWith(".d.ts") && !isTestFile(path);
}

function isAllowed(path: string, allowedPaths: string[]): boolean {
    // [ ] Is a path covered by the allowed list
}

function dependencyNames(manifest: Manifest): Set<string> {
    // [ ] Every dependency the manifest declares
}

function result(check: CheckName, details: string[]): CheckResult {
    const sorted = [...new Set(details)].sort();
    return { check, passed: sorted.length === 0, details: sorted };
}

function reviewChecklist(pr: PullRequest): CheckResult[] {
    // [ ] Untested source changes and new dependencies

    // [ ] Debug markers in added lines

    // [ ] Paths outside the allowed list, and the PR size

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
