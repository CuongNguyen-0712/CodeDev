import { readFileSync } from "node:fs";

// CodeDev agent loop: which test files to run after an edit. Reference solution.

type Change = { path: string; status: "added" | "modified" | "deleted" };
type Repo = {
    changed: Change[];
    imports: Record<string, string[]>; // source file -> files it imports (repository after the change)
    tests: Record<string, string[]>; // test file -> files it imports (repository after the change)
    runAll: string[]; // a change to one of these paths runs every test
};
type Selection = { all: boolean; tests: string[]; untested: string[] };

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function selectTests(repo: Repo): Selection {
    const allTests = Object.keys(repo.tests).sort(byCodeUnit);
    const changed = [...new Set(repo.changed.map((c) => c.path))].sort(byCodeUnit);
    const deleted = new Set(repo.changed.filter((c) => c.status === "deleted").map((c) => c.path));
    const runAll = new Set(repo.runAll);

    // Every file each test reaches through imports, with a visited set for cycles.
    const reaches = new Map<string, Set<string>>();
    for (const test of allTests) {
        // only the files the test imports itself
        reaches.set(test, new Set<string>([test, ...(repo.tests[test] ?? [])]));
    }

    const all = changed.some((path) => runAll.has(path));
    const tests = all ? allTests : allTests.filter((test) => changed.some((path) => reaches.get(test)!.has(path)));
    const untested = changed.filter(
        (path) =>
            !deleted.has(path) &&
            !runAll.has(path) &&
            !allTests.some((test) => reaches.get(test)!.has(path)),
    );
    return { all, tests, untested };
}

// ---------------------------------------------------------------- test runner (do not change)
const repo: Repo = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(selectTests(repo)));
