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
    // @piece glob-match: Match the whole path, every brace alternative
    const segments = path.split("/");
    return expandBraces(pattern).some((alt) => matchSegments(alt.split("/"), 0, segments, 0));
    // @end
}

function checkScope(changes: Change[], allowed: string[], forbidden: Forbidden[]): Report {
    // @piece paths-to-check: The paths to check, two for a rename
    const toCheck: { path: string; change: string }[] = [];
    for (const c of changes) {
        if (c.status === "renamed") {
            toCheck.push({ path: c.from, change: "renamed-from" }, { path: c.path, change: "renamed-to" });
        } else {
            toCheck.push({ path: c.path, change: c.status });
        }
    }
    // @end
    const violations: Violation[] = [];
    // @piece judge-paths: The first violation of each path, if any
    for (const { path, change } of toCheck) {
        if (invalidPath(path)) {
            violations.push({ path, change, reason: "invalid path" });
            continue;
        }
        const isAllowed = allowed.some((p) => matchGlob(p, path));
        const hit = forbidden.find((f) => matchGlob(f.pattern, path) && !(f.unlessAllowed && isAllowed));
        if (hit) violations.push({ path, change, reason: `forbidden: ${hit.pattern}` });
        else if (!isAllowed) violations.push({ path, change, reason: "outside allowed paths" });
    }
    // @end
    // @piece report: Sorted violations and the report
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    violations.sort((a, b) => cmp(a.path, b.path) || cmp(a.change, b.change));
    return { ok: violations.length === 0, checked: toCheck.length, violations };
    // @end
}

// @piece expand-braces: Helper: expand {a,b} groups into alternatives
function expandBraces(pattern: string): string[] {
    const open = pattern.indexOf("{");
    if (open === -1) return [pattern];
    const close = pattern.indexOf("}", open + 1);
    if (close === -1) return [pattern];
    const head = pattern.slice(0, open);
    const rest = expandBraces(pattern.slice(close + 1));
    return pattern.slice(open + 1, close).split(",").flatMap((alt) => rest.map((r) => head + alt + r));
}
// @end

// @piece segment-matches: Helper: does one pattern segment match one path segment
function segmentMatches(pattern: string, segment: string): boolean {
    let source = "";
    for (const ch of pattern) {
        if (ch === "*") source += source.endsWith(".*") ? "" : ".*";
        else if (ch === "?") source += ".";
        else source += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
    }
    return new RegExp(`^${source}$`, "s").test(segment);
}
// @end

// @piece match-segments: Helper: match segment lists, ** included
function matchSegments(p: string[], i: number, s: string[], j: number): boolean {
    if (i === p.length) return j === s.length;
    if (p[i] === "**") return matchSegments(p, i + 1, s, j) || (j < s.length && matchSegments(p, i, s, j + 1));
    return j < s.length && segmentMatches(p[i], s[j]) && matchSegments(p, i + 1, s, j + 1);
}
// @end

// @piece invalid-path: Helper: is a path invalid
function invalidPath(path: string): boolean {
    if (path === "" || path.includes("\\")) return true;
    return path.split("/").some((seg) => seg === "" || seg === "." || seg === "..");
}
// @end

// ---------------------------------------------------------------- test runner (do not change)
// Input: { allowed, forbidden, changes }. Output: the report as JSON.
type Input = { allowed: string[]; forbidden: Forbidden[]; changes: Change[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkScope(input.changes, input.allowed, input.forbidden)));
