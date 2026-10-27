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

function shannonEntropy(s: string): number {
    return 0;
}

function scanDiff(diff: string, allowPaths: string[]): Finding[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "diff": "<output of git diff>", "allowPaths": ["test/fixtures/", ...] }
// Output: the findings as one JSON array.
const input: { diff: string; allowPaths: string[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(scanDiff(input.diff, input.allowPaths)));
