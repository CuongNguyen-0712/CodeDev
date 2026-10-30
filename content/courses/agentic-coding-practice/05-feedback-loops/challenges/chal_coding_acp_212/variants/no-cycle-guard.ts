import { readFileSync } from "node:fs";

// CodeDev after-edit hook: after every edit the coding agent makes, the hook runs only the tests
// that can be affected by the changed files, so feedback takes seconds instead of the whole suite.
//
// selectTests(input) receives:
//   graph           file -> the files it imports (repo-relative paths)
//   tests           every test file that exists now
//   changed         the files the agent changed (edited, added or deleted), in edit order
//   runAllPatterns  changes that can affect every test
//
// Rules:
//   1. Run everything: a changed file matches a pattern when
//        - the pattern ends with "/" and the path starts with it      ("test/fixtures/")
//        - the pattern contains "/" otherwise and the path equals it  ("test/setup.ts")
//        - the pattern has no "/" and the path's last segment equals it ("package.json")
//      If any changed file matches: runAll true, trigger = the FIRST changed file (in the given
//      order) that matches, tests = every test file.
//   2. Otherwise: runAll false, trigger null, tests = every test file that is itself changed or
//      imports a changed file directly or through other files (transitively).
//   3. A changed path may be missing from graph (deleted, or it imports nothing): it still counts.
//      Import cycles must not loop forever. Only paths listed in tests are ever returned.
//   4. tests: no duplicates, sorted by plain string comparison (Array.prototype.sort()).

interface SelectionInput {
    graph: Record<string, string[]>;
    tests: string[];
    changed: string[];
    runAllPatterns: string[];
}

interface Selection {
    runAll: boolean;
    trigger: string | null;
    tests: string[];
}

function matchesPattern(path: string, pattern: string): boolean {
    if (pattern.endsWith("/")) return path.startsWith(pattern);
    if (pattern.includes("/")) return path === pattern;
    return path.split("/").at(-1) === pattern;
}

function reaches(graph: Record<string, string[]>, file: string, changed: Set<string>): boolean {
    if (changed.has(file)) return true;
    return (graph[file] ?? []).some((dep) => reaches(graph, dep, changed));
}

function selectTests(input: SelectionInput): Selection {
    const allTests = [...new Set(input.tests)].sort();
    const trigger = input.changed.find((file) => input.runAllPatterns.some((p) => matchesPattern(file, p)));
    if (trigger !== undefined) return { runAll: true, trigger, tests: allTests };
    const changed = new Set(input.changed);
    return { runAll: false, trigger: null, tests: allTests.filter((test) => reaches(input.graph, test, changed)) };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: SelectionInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(selectTests(input)));
