import { readFileSync } from "node:fs";

// CodeDev "ai-pr-check": the CI step that runs on every pull request opened by the coding agent and
// posts one bot comment. It checks only what a machine can check; people review the rest.
//
// reviewPullRequest(pr) returns every finding, sorted by path, then line, then rule, then detail.
// A finding is { path, line, rule, detail }; line is the line number in the new file, or 0 for a
// finding about a whole file or about package.json.
//
// File kinds:
//   code file   the path ends with .ts, .tsx, .js, .jsx, .mjs or .cjs
//   test file   a code file whose path starts with "tests/", contains "/__tests__/", or whose file name
//               ends with .test.<ext> or .spec.<ext>
//   source file a code file under "src/" that is not a test file
//
// Rules:
//   "no-test-change"  no test file in the PR has a status other than "deleted", and a source file has a
//                     status other than "deleted": one finding per such source file, line 0,
//                     detail "no test file changed"
//   "new-dependency"  a package name in dependencies or devDependencies of packageJsonAfter that is in
//                     neither of them in packageJsonBefore, and is not in allowlist: path "package.json",
//                     line 0, detail = the package name. A null package.json has no dependencies.
//   "todo"            an added line of a code file that is not a test file contains the word TODO or
//                     FIXME (upper case, whole word): detail = the one that comes first in the line
//   "console-log"     an added line of a code file that is not a test file contains console.log( (spaces
//                     allowed before the parenthesis), unless the trimmed line starts with //:
//                     detail "console.log"
//   "secret"          an added line of ANY file matches a secret pattern: one finding per line, detail =
//                     the kind of the first pattern that matches, in this order. Never the value.
//                       "private-key"     -----BEGIN <words> PRIVATE KEY-----
//                       "aws-access-key"  AKIA followed by 16 upper-case letters or digits
//                       "api-key"         sk_live_ followed by 16+ letters or digits, or sk- followed by
//                                         20+ letters, digits, _ or -
//   "out-of-scope"    pr.scope is a non-empty list of paths (a trailing "/" is ignored); a file of any
//                     status whose path is not equal to an entry and does not start with entry + "/":
//                     line 0, detail "outside the declared scope". No scope, or [], skips this rule.
// addedLines may be missing (a deleted file): treat it as [].

type FileStatus = "added" | "modified" | "deleted" | "renamed";

interface AddedLine {
    line: number;
    text: string;
}

interface ChangedFile {
    path: string;
    status: FileStatus;
    addedLines?: AddedLine[];
}

interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface PullRequest {
    files: ChangedFile[];
    packageJsonBefore: PackageJson | null;
    packageJsonAfter: PackageJson | null;
    allowlist: string[];
    scope?: string[];
}

interface Finding {
    path: string;
    line: number;
    rule: string;
    detail: string;
}

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SECRETS: [string, RegExp][] = [
    ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["aws-access-key", /AKIA[0-9A-Z]{16}/],
    ["api-key", /sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}/],
];

function isCode(path: string): boolean {
    return CODE_FILE.test(path);
}

function isTest(path: string): boolean {
    return isCode(path) && (path.startsWith("tests/") || path.includes("/__tests__/") || /\.(test|spec)\.[a-z]+$/.test(path));
}

function dependencyNames(pkg: PackageJson | null): Set<string> {
    return new Set([...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})]);
}

function reviewPullRequest(pr: PullRequest): Finding[] {
    const findings: Finding[] = [];
    const add = (path: string, line: number, rule: string, detail: string) => findings.push({ path, line, rule, detail });

    const live = pr.files.filter((f) => f.status !== "deleted");
    if (!live.some((f) => isTest(f.path))) {
        for (const f of live) {
            if (f.path.startsWith("src/") && isCode(f.path)) add(f.path, 0, "no-test-change", "no test file changed");
        }
    }

    const before = dependencyNames(pr.packageJsonBefore);
    for (const name of dependencyNames(pr.packageJsonAfter)) {
        if (!before.has(name) && !pr.allowlist.includes(name)) add("package.json", 0, "new-dependency", name);
    }

    const scope = (pr.scope ?? []).map((s) => s.replace(/\/+$/, ""));
    for (const f of pr.files) {
        if (scope.length > 0 && !scope.some((s) => f.path === s || f.path.startsWith(s + "/"))) {
            add(f.path, 0, "out-of-scope", "outside the declared scope");
        }
        const checkCode = isCode(f.path) && !isTest(f.path);
        for (const { line, text } of f.addedLines ?? []) {
            if (checkCode) {
                const marker = text.match(/\b(TODO|FIXME)\b/);
                if (marker) add(f.path, line, "todo", marker[1]);
                if (/\bconsole\.log\s*\(/.test(text) && !text.trim().startsWith("//")) add(f.path, line, "console-log", "console.log");
            }
            const secret = SECRETS.find(([, pattern]) => pattern.test(text));
            if (secret) add(f.path, line, "secret", secret[0]);
        }
    }

    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return findings.sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.rule, b.rule) || cmp(a.detail, b.detail));
}

// ---------------------------------------------------------------- test runner (do not change)
const pr: PullRequest = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(reviewPullRequest(pr)));
