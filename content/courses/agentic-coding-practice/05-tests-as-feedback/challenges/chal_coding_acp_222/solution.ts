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
    // @piece inputs: Test files, changed paths, deleted paths, runAll
    const allTests = Object.keys(repo.tests).sort(byCodeUnit);
    const changed = [...new Set(repo.changed.map((c) => c.path))].sort(byCodeUnit);
    const deleted = new Set(repo.changed.filter((c) => c.status === "deleted").map((c) => c.path));
    const runAll = new Set(repo.runAll);
    // @end

    // @piece reach: Every file each test reaches (imports may loop)
    // Every file each test reaches through imports, with a visited set for cycles.
    const reaches = new Map<string, Set<string>>();
    for (const test of allTests) {
        const seen = new Set<string>([test]);
        const stack = [...(repo.tests[test] ?? [])];
        while (stack.length > 0) {
            const file = stack.pop()!;
            if (seen.has(file)) continue;
            seen.add(file);
            for (const next of repo.imports[file] ?? []) if (!seen.has(next)) stack.push(next);
        }
        reaches.set(test, seen);
    }
    // @end

    // @piece pick-tests: Run everything, or the tests that reach a change
    const all = changed.some((path) => runAll.has(path));
    const tests = all ? allTests : allTests.filter((test) => changed.some((path) => reaches.get(test)!.has(path)));
    // @end
    // @piece untested: Changed paths no test reaches
    const untested = changed.filter(
        (path) =>
            !deleted.has(path) &&
            !runAll.has(path) &&
            !allTests.some((test) => reaches.get(test)!.has(path)),
    );
    // @end
    return { all, tests, untested };
}

// @piece by-code-unit: Helper: plain string comparison for sort
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// @end

// ---------------------------------------------------------------- test runner (do not change)
const repo: Repo = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(selectTests(repo)));
