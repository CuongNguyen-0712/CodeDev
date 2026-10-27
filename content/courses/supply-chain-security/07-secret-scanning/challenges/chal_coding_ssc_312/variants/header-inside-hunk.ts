import { readFileSync } from "node:fs";

// Wrong: any "+++" or "---" line is treated as a header, even inside a hunk.

type Finding = { file: string; line: number; rule: string; preview: string };

const ALLOW_MARKER = "codedev-scan:allow";

const PATTERNS: { rule: string; regex: RegExp; group: number }[] = [
    { rule: "aws-access-key-id", regex: /(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])/g, group: 0 },
    { rule: "github-token", regex: /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g, group: 0 },
    { rule: "slack-token", regex: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/g, group: 0 },
    { rule: "private-key", regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, group: 0 },
    {
        rule: "generic-secret",
        regex: /(?<![A-Za-z0-9_.-])[A-Za-z0-9_]*?(?:key|token|secret|password)["']?\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{8,})/gi,
        group: 1,
    },
];

function shannonEntropy(s: string): number {
    const counts = new Map<string, number>();
    for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    let h = 0;
    for (const n of counts.values()) {
        const p = n / s.length;
        h -= p * Math.log2(p);
    }
    return h;
}

function preview(secret: string): string {
    return `${secret.slice(0, 4)}... (${secret.length} chars)`;
}

function scanLine(content: string): { rule: string; secret: string }[] {
    const found: { rule: string; secret: string }[] = [];
    for (const { rule, regex, group } of PATTERNS) {
        for (const m of content.matchAll(regex)) {
            const secret = m[group];
            if (rule === "generic-secret" && secret.startsWith("process.env.")) continue;
            found.push({ rule, secret });
            break;
        }
    }
    if (found.length > 0) return found;
    for (const m of content.matchAll(/"([^"]*)"|'([^']*)'/g)) {
        const s = m[1] ?? m[2];
        if (s.length < 20 || !/^[A-Za-z0-9+/=_-]+$/.test(s)) continue;
        const hex = /^[0-9a-fA-F]+$/.test(s);
        const h = shannonEntropy(s);
        if (hex ? h >= 3.0 : h >= 4.5) return [{ rule: hex ? "high-entropy-hex" : "high-entropy-base64", secret: s }];
    }
    return [];
}

function scanDiff(diff: string, allowPaths: string[]): Finding[] {
    const findings: Finding[] = [];
    let file: string | null = null;
    let inHunk = false;
    let newLine = 0;
    for (const raw of diff.split("\n")) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (line.startsWith("diff --git ")) {
            file = null;
            inHunk = false;
            continue;
        }
        if (line.startsWith("@@")) {
            const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            inHunk = m !== null;
            if (m) newLine = Number(m[1]);
            continue;
        }
        if (line.startsWith("+++") || line.startsWith("---")) inHunk = false;
        if (!inHunk) {
            if (line.startsWith("+++ ")) {
                const path = line.slice(4);
                file = path === "/dev/null" ? null : path.startsWith("b/") ? path.slice(2) : path;
            }
            continue;
        }
        if (line.startsWith("+")) {
            const lineNo = newLine++;
            const content = line.slice(1);
            if (file === null || allowPaths.some((p) => file!.startsWith(p)) || content.includes(ALLOW_MARKER)) continue;
            for (const { rule, secret } of scanLine(content)) findings.push({ file, line: lineNo, rule, preview: preview(secret) });
        } else if (line.startsWith(" ") || line === "") {
            newLine++;
        }
        // "-" (removed) and "\" (no newline at end of file) do not move the new-file line number.
    }
    return findings.sort((a, b) =>
        a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line !== b.line ? a.line - b.line : a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0,
    );
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "diff": "<output of git diff>", "allowPaths": ["test/fixtures/", ...] }
// Output: the findings as one JSON array.
const input: { diff: string; allowPaths: string[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(scanDiff(input.diff, input.allowPaths)));
