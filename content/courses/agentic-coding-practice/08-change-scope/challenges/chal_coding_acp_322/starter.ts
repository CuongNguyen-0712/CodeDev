import { readFileSync } from "node:fs";

// CodeDev agent harness: after the agent finishes a task, the harness compares the changed files
// (from git diff --name-status) with the paths the task allows and the paths no task may touch,
// and refuses to open the PR while there are violations.
//
// Paths to check: added, modified and deleted changes give their path; a renamed change gives TWO
// paths, its old path (from) with change "renamed-from" and its new path (path) with change "renamed-to".
// For each path, the first of these that applies is a violation (otherwise the path is fine):
//   1. "invalid path"            the path is empty, contains "\", or has a segment (between "/") that is
//                                empty, "." or ".." (so a path that starts or ends with "/" is invalid).
//   2. "forbidden: <pattern>"    the first entry of `forbidden` (in list order) whose pattern matches the path,
//                                skipping an entry with unlessAllowed true when the path matches an allowed pattern.
//   3. "outside allowed paths"   the path matches none of the `allowed` patterns.
// Return { ok, checked, violations }: checked = number of paths checked, ok = no violations,
// violations = [{ path, change, reason }] sorted by path, then by change (compare strings with < and >).
//
// matchGlob(pattern, path): true when the pattern matches the WHOLE path.
//   - Braces first: "{" starts a group that ends at the next "}"; the text between is split on "," and the
//     pattern matches when one alternative matches. Several groups give every combination; an alternative
//     may be empty ("{,.local}"). A "{" with no "}" after it is a plain character.
//   - Then the pattern and the path are split on "/" into segments. A segment that is exactly "**" matches
//     zero or more whole path segments. In any other segment, "*" matches any run of characters (also none)
//     and "?" exactly one character, both only inside that one segment; every other character matches
//     itself, case-sensitive - ".", "(", ")", "[", "]" and "+" are plain characters.
//   - "*" and "?" also match a leading ".". A pattern without "/" only matches a path without "/":
//     "*.pem" does not match "certs/dev.pem", "**/*.pem" does.
//
// Do not change the types or the test runner.

type Change =
    | { status: "added" | "modified" | "deleted"; path: string }
    | { status: "renamed"; from: string; path: string };
type Forbidden = { pattern: string; unlessAllowed: boolean };
type Violation = { path: string; change: string; reason: string };
type Report = { ok: boolean; checked: number; violations: Violation[] };

function matchGlob(pattern: string, path: string): boolean {
    return false;
}

function checkScope(changes: Change[], allowed: string[], forbidden: Forbidden[]): Report {
    return { ok: true, checked: 0, violations: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { allowed, forbidden, changes }. Output: the report as JSON.
type Input = { allowed: string[]; forbidden: Forbidden[]; changes: Change[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkScope(input.changes, input.allowed, input.forbidden)));
