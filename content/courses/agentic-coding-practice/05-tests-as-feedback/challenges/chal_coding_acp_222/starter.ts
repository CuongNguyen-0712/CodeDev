import { readFileSync } from "node:fs";

// CodeDev agent loop: which test files to run after an edit.
//
// A test file reaches itself, the files in its tests entry, and everything those files import,
// transitively (imports may form cycles). Return:
//   all:      true when a changed path is in runAll (then tests = every test file)
//   tests:    otherwise, the test files that reach at least one changed path (deleted paths included)
//   untested: changed paths no test reaches, without deleted paths and runAll paths
// Sort tests and untested with plain string comparison, no duplicates.
// The full rules are in the challenge description.

type Change = { path: string; status: "added" | "modified" | "deleted" };
type Repo = {
    changed: Change[];
    imports: Record<string, string[]>; // source file -> files it imports (repository after the change)
    tests: Record<string, string[]>; // test file -> files it imports (repository after the change)
    runAll: string[]; // a change to one of these paths runs every test
};
type Selection = { all: boolean; tests: string[]; untested: string[] };

function selectTests(repo: Repo): Selection {
    return { all: false, tests: [], untested: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
const repo: Repo = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(selectTests(repo)));
