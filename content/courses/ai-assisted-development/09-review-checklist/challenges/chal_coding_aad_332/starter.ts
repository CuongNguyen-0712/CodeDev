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

function reviewChecklist(pr: PullRequest): CheckResult[] {
    // TODO: return the five check results in order
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
const pr: PullRequest = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(reviewChecklist(pr)));
