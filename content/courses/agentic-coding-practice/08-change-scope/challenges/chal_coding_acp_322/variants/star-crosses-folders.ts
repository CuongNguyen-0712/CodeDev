import { readFileSync } from "node:fs";

// Wrong: a single * also matches "/".

type Change =
    | { status: "added" | "modified" | "deleted"; path: string }
    | { status: "renamed"; from: string; path: string };
type Forbidden = { pattern: string; unlessAllowed: boolean };
type Violation = { path: string; change: string; reason: string };
type Report = { ok: boolean; checked: number; violations: Violation[] };

function expandBraces(pattern: string): string[] {
    const open = pattern.indexOf("{");
    if (open === -1) return [pattern];
    const close = pattern.indexOf("}", open + 1);
    if (close === -1) return [pattern];
    const head = pattern.slice(0, open);
    const rest = expandBraces(pattern.slice(close + 1));
    return pattern.slice(open + 1, close).split(",").flatMap((alt) => rest.map((r) => head + alt + r));
}

function segmentMatches(pattern: string, segment: string): boolean {
    let source = "";
    for (const ch of pattern) {
        if (ch === "*") source += source.endsWith(".*") ? "" : ".*";
        else if (ch === "?") source += ".";
        else source += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
    }
    return new RegExp(`^${source}$`, "s").test(segment);
}

function matchSegments(p: string[], i: number, s: string[], j: number): boolean {
    if (i === p.length) return j === s.length;
    if (p[i] === "**") return matchSegments(p, i + 1, s, j) || (j < s.length && matchSegments(p, i, s, j + 1));
    return j < s.length && segmentMatches(p[i], s[j]) && matchSegments(p, i + 1, s, j + 1);
}

function matchGlob(pattern: string, path: string): boolean {
    return expandBraces(pattern).some((alt) => {
        let source = "";
        for (let i = 0; i < alt.length; i++) {
            const ch = alt[i];
            if (alt.startsWith("**/", i)) { source += "(?:.*/)?"; i += 2; }
            else if (alt.startsWith("**", i)) { source += ".*"; i += 1; }
            else if (ch === "*") source += ".*";
            else if (ch === "?") source += "[^/]";
            else source += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
        }
        return new RegExp(`^${source}$`).test(path);
    });
}

function invalidPath(path: string): boolean {
    if (path === "" || path.includes("\\")) return true;
    return path.split("/").some((seg) => seg === "" || seg === "." || seg === "..");
}

function checkScope(changes: Change[], allowed: string[], forbidden: Forbidden[]): Report {
    const toCheck: { path: string; change: string }[] = [];
    for (const c of changes) {
        if (c.status === "renamed") {
            toCheck.push({ path: c.from, change: "renamed-from" }, { path: c.path, change: "renamed-to" });
        } else {
            toCheck.push({ path: c.path, change: c.status });
        }
    }
    const violations: Violation[] = [];
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
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    violations.sort((a, b) => cmp(a.path, b.path) || cmp(a.change, b.change));
    return { ok: violations.length === 0, checked: toCheck.length, violations };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { allowed, forbidden, changes }. Output: the report as JSON.
type Input = { allowed: string[]; forbidden: Forbidden[]; changes: Change[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkScope(input.changes, input.allowed, input.forbidden)));
