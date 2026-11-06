import { readFileSync } from "node:fs";

// CodeDev CI secret scanner. The "secrets" job runs on every pull request with the output of
//   git diff --unified=3 origin/main...HEAD
// and fails the build when scanDiff returns at least one finding.
//
// Reading the diff:
//   - "diff --git ..." starts a new file section. Before the first hunk of a section, "+++ b/<path>"
//     names the file (drop the "b/" prefix); "+++ /dev/null" means the file was deleted.
//   - "@@ -a,b +c,d @@ ..." starts a hunk: the next line of the new file is line c (",d" may be missing).
//     A line that starts with "@@" but does not have this shape ends the hunk (skip until the next one).
//   - Inside a hunk: "+" = added line (it has the current number, then the number goes up by 1),
//     " " or an empty line = context (the number goes up by 1), "-" = removed and "\" = "No newline at
//     end of file" (the number does not change). A line starting with "+++" or "---" inside a hunk is an
//     added or removed line, not a header. Lines may end with "\r\n": ignore the "\r".
//
// Only ADDED lines are scanned. Skip a file whose path starts with one of allowPaths, and skip any
// added line that contains the marker codedev-scan:allow. The rules run on the text after the "+":
//   aws-access-key-id  AKIA or ASIA + 16 of A-Z 0-9, no letter or digit just before or after
//   github-token       gh[pousr]_ + 36 or more of A-Z a-z 0-9, or github_pat_ + 22 or more of A-Z a-z 0-9 _
//                      (no letter, digit or _ just before)
//   slack-token        xox[baprs]- + 10 or more of A-Z a-z 0-9 -   (no letter or digit just before)
//   private-key        -----BEGIN PRIVATE KEY----- with zero or more words of A-Z 0-9 before PRIVATE
//                      ("-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN OPENSSH PRIVATE KEY-----", ...)
//   generic-secret     a name of A-Z a-z 0-9 _ ending in key, token, secret or password (any case, not
//                      preceded by A-Z a-z 0-9 _ . -), an optional quote, optional spaces, ":" or "=",
//                      optional spaces, an optional quote, then a value of 8 or more of A-Z a-z 0-9 _ - + / = .
//                      A value that starts with "process.env." is a reference, not a secret: skip it.
// Each of these five rules reports at most one finding per line (its first match).
// Only when none of them matched, the entropy check runs on the line's string literals, "..." and
// '...' from left to right (not `...`): a literal counts when it has 20 or more characters, all of
// A-Z a-z 0-9 + / = _ -. If all its characters are hex (0-9 a-f A-F), it is high-entropy-hex when its
// Shannon entropy is >= 3.0; otherwise it is high-entropy-base64 when the entropy is >= 4.5. Report
// only the first literal that passes. Entropy in bits per character: H = -sum(p * log2(p)) over the
// distinct characters, p = count / length.
//
// A finding is { file, line, rule, preview }: line = the number in the new file, preview = the first
// 4 characters of the secret + "... (" + its length + " chars)", e.g. "AKIA... (20 chars)". The secret
// is the whole match, except for generic-secret (the value) and the entropy rules (the literal's
// content). Return the findings sorted by file, then line, then rule (plain string order).

type Finding = { file: string; line: number; rule: string; preview: string };

// @piece patterns: The secret patterns to look for
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
// @end

function shannonEntropy(s: string): number {
    // @piece entropy: Shannon entropy in bits per character
    const counts = new Map<string, number>();
    for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    let h = 0;
    for (const n of counts.values()) {
        const p = n / s.length;
        h -= p * Math.log2(p);
    }
    return h;
    // @end
}

function preview(secret: string): string {
    return `${secret.slice(0, 4)}... (${secret.length} chars)`;
}

function scanLine(content: string): { rule: string; secret: string }[] {
    // @piece known-patterns: Look for the known secret patterns
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
    // @end
    // @piece high-entropy: Otherwise look for random-looking literals
    for (const m of content.matchAll(/"([^"]*)"|'([^']*)'/g)) {
        const s = m[1] ?? m[2];
        if (s.length < 20 || !/^[A-Za-z0-9+/=_-]+$/.test(s)) continue;
        const hex = /^[0-9a-fA-F]+$/.test(s);
        const h = shannonEntropy(s);
        if (hex ? h >= 3.0 : h >= 4.5) return [{ rule: hex ? "high-entropy-hex" : "high-entropy-base64", secret: s }];
    }
    return [];
    // @end
}

function scanDiff(diff: string, allowPaths: string[]): Finding[] {
    const findings: Finding[] = [];
    let file: string | null = null;
    let inHunk = false;
    let newLine = 0;
    for (const raw of diff.split("\n")) {
        // @piece diff-headers: Follow the file and hunk headers
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
        if (!inHunk) {
            if (line.startsWith("+++ ")) {
                const path = line.slice(4);
                file = path === "/dev/null" ? null : path.startsWith("b/") ? path.slice(2) : path;
            }
            continue;
        }
        // @end
        // @piece added-lines: Scan added lines and keep the line number
        if (line.startsWith("+")) {
            const lineNo = newLine++;
            const content = line.slice(1);
            if (file === null || allowPaths.some((p) => file!.startsWith(p)) || content.includes(ALLOW_MARKER)) continue;
            for (const { rule, secret } of scanLine(content)) findings.push({ file, line: lineNo, rule, preview: preview(secret) });
        } else if (line.startsWith(" ") || line === "") {
            newLine++;
        }
        // "-" (removed) and "\" (no newline at end of file) do not move the new-file line number.
        // @end
    }
    // @piece sort-findings: Order the findings
    return findings.sort((a, b) =>
        a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line !== b.line ? a.line - b.line : a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0,
    );
    // @end
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "diff": "<output of git diff>", "allowPaths": ["test/fixtures/", ...] }
// Output: the findings as one JSON array.
const input: { diff: string; allowPaths: string[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(scanDiff(input.diff, input.allowPaths)));
