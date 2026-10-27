// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-3-1",
    title: "Secret scanning: patterns & entropy in a diff",
    slug: { _type: "slug", current: "secret-scanning-patterns-entropy-diff" },
    description:
        "An AI-written S3 upload shipped an AWS secret key in a ?? fallback, and the key id it removed in a later commit was still on GitHub. Learn why CI scans the added lines of every diff, which known patterns catch real tokens, how Shannon entropy finds secrets with no known prefix (and why it is noisy), how to ignore fixtures and false positives without blinding the scanner, and why finding a pushed secret always ends with rotating it.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "On Saturday CloudTrail shows PutObject and ListObjects calls on the codedev-course-covers bucket from an IP address nobody recognises, signed with the access key of the cover-upload service. The key came from pull request #482, \"Add S3 upload for course covers\", written with an AI assistant and squash-merged on Thursday. The repository already had a check, grep -rE \"AKIA[0-9A-Z]{16}\" src/, and it passed: the key id had been moved to an environment variable before the merge, and the secret key stayed in the code as a fallback that ended up in a browser bundle.",
    },

    content: [
        h2("1. The incident: a fallback that shipped a key"),
        p("Pull request #482 added an upload button for course covers in the admin area. The AI assistant was asked to \"add an S3 client so admins can upload course covers to the codedev-course-covers bucket\", and its first commit put the credentials straight into the module. A reviewer asked for environment variables, and the next commit changed the key id. The secret key got a fallback instead:"),
        code("typescript", `
// src/lib/storage.ts - as merged
import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION ?? "ap-southeast-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
const secretAccessKey = process.env.S3_SECRET ?? "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

export const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });`, "storage.ts"),
        p("The values in this lesson are AWS's own documentation examples; the real ones were different. The upload form imported a helper from this module, so the bundler put `storage.ts`, with its string literal, into a JavaScript chunk that every visitor of the admin page downloads. The key id was no longer in the code, but it was in commit `a1c9e02`, which had been pushed to GitHub with the branch. Someone who had both strings could sign requests as the upload service."),
        p("The existing check could not have caught either. It searched the current files for one prefix, `AKIA`, and by the time it ran the key id was gone from the tree and the secret key has no prefix at all."),

        h2("2. Read the evidence"),
        p("Start from the cloud side: which key, which calls, from where. CloudTrail records every API call with the access key id that signed it:"),
        code("json", `
{
  "eventTime": "2026-10-24T02:13:51Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "ListObjects",
  "sourceIPAddress": "203.0.113.77",
  "userAgent": "aws-cli/2.17.4",
  "userIdentity": { "type": "IAMUser", "userName": "svc-cover-upload", "accessKeyId": "AKIAIOSFODNN7EXAMPLE" },
  "requestParameters": { "bucketName": "codedev-course-covers" }
}`, "CloudTrail event"),
        p("The service never uses the AWS CLI and never calls from that address: the key is being used by someone else. Then check where the secret is reachable. The production bundle is public, so anyone can do what this command does:"),
        code("bash", `
$ curl -s https://app.codedev.test/_next/static/chunks/app/admin/covers/page-3f2a91.js | grep -o 'wJal[A-Za-z0-9/+]*'
wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`, "terminal"),
        p("Finally, find every commit that ever contained the key id. `git log -S` (the \"pickaxe\") lists commits that changed the number of occurrences of a string, across all branches you have fetched:"),
        code("bash", `
$ git log --all --oneline -S "AKIAIOSFODNN7EXAMPLE"
c04e8aa move key to env
a1c9e02 add S3 client`, "terminal"),
        p("Two commits: the one that added it and the one that removed it. Squash-merging #482 kept both out of `main`, but GitHub still serves them from the pull request, and every clone made during the review has them."),
        callout("warning", "First rotate, then investigate",
            "A secret that reached a remote repository, a CI log or a public bundle is compromised, whatever happens to the code afterwards. Deactivate the key, create a new one, deploy it, then delete the old one, and only then dig into the history. Rewriting Git history afterwards is optional clean-up; it does not undo a single download."),

        h2("3. Core idea: scan what a change adds, before it merges"),
        p("Secret scanning is a backstop. The plan is still that secrets never enter the code: they live in the deployment's environment or a secret manager, and the code fails at startup when one is missing (the next lesson). A scanner catches the moment the plan breaks - an AI suggestion with a literal, a debug line, a copied `.env` - while it is still a pull request."),
        h3("Why the diff, and why only added lines"),
        bullets([
            "**Added lines are the new risk.** A pull request that removes a key does not leak it; the commit that added it did. Removed and context lines are already in history, so flagging them again blocks unrelated work and teaches people to ignore the job.",
            "**Fast and attributable.** Scanning a few hundred changed lines takes milliseconds, and the finding points at a file and line of the author's own change, in the new file's numbering, so the annotation lands on the right line in the review.",
            "**Not enough on its own.** The net diff `origin/main...HEAD` hides a secret that was added and removed inside the same branch, exactly like `a1c9e02` and `c04e8aa`. Scan each pushed commit (`git log -p origin/main..HEAD`), turn on push protection where your Git host offers it, and run a full-history scan once when you adopt the tool.",
        ]),
        h3("Two kinds of detector"),
        p("**Patterns** match formats that providers designed to be recognisable. They are precise: a match is almost always a real credential. The scanner in this lesson uses five rules:"),
        bullets([
            "`aws-access-key-id`: `AKIA` (long-lived user key) or `ASIA` (temporary STS key) followed by 16 upper-case letters or digits.",
            "`github-token`: `ghp_`, `gho_`, `ghu_`, `ghs_` or `ghr_` followed by at least 36 letters and digits, or a fine-grained `github_pat_` token.",
            "`slack-token`: `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-` or `xoxs-` followed by token characters.",
            "`private-key`: a PEM header such as `-----BEGIN RSA PRIVATE KEY-----` or `-----BEGIN OPENSSH PRIVATE KEY-----`. A public key or a certificate is not a secret and does not match.",
            "`generic-secret`: an assignment whose name ends in `key`, `token`, `secret` or `password` (`API_KEY=...`, `\"authToken\": \"...\"`, `password: ...`) with a value of at least 8 characters. It skips `process.env.X` references, but it is still the noisiest pattern.",
        ]),
        p("**Entropy** catches what has no format: the AWS secret key above, a random session secret, a signing key. Shannon entropy measures how unpredictable the characters of a string are, in bits per character:"),
        code("text", `
H = - sum over each distinct character c of  p(c) * log2(p(c)),   p(c) = count(c) / length

"aaaaaaaa"                     1 distinct character            H = 0.00
"FAKEFAKEFAKEFAKEFAKEFAKE"     4 characters, equally often     H = 2.00
"550e8400-e29b-41d4-a716-..."  a UUID (hex and dashes)         H = 3.39
"wJalrXUtnFEMI/K7MDENG/b..."   40 random base64 characters     H = 4.66`, "entropy of a few strings"),
        p("Random base64 uses 64 symbols, so a long random string approaches 6 bits per character; English words, identifiers and repeated test values sit far lower. Hex has only 16 symbols, so its maximum is 4 bits per character and it needs its own, lower threshold. This scanner uses thresholds taken from the classic TruffleHog entropy check: **4.5 for base64-like strings and 3.0 for hex strings, for strings of 20 characters or more.** A string can never have more bits per character than log2 of its length, so a 20-character string tops out at 4.32: short strings cannot pass the base64 threshold by construction."),
        h3("When entropy lies"),
        p("Many legitimate strings are random by design: lockfile `integrity` hashes, Subresource Integrity attributes, Git commit SHAs in `uses:` lines, content hashes in file names, UUIDs, encoded images. That is why this scanner looks only at quoted string literals, why lockfiles are on the allowed-path list, and why entropy runs only on lines where no pattern already matched. Tune for the noise you measure, not for every string you can imagine: if half of the findings are false, people stop reading them."),
        h3("Ignoring findings without blinding the scanner"),
        bullets([
            "**Allowed paths, as narrow prefixes.** `test/fixtures/` for the scanner's own fake keys, `package-lock.json` for hashes. Never `test/` or `*.json`: a real key in a test helper is still a real key.",
            "**An inline marker on one line**, such as `// codedev-scan:allow md5 of empty body`. It shows up in the diff, so a reviewer sees and questions it, and it covers exactly one line.",
            "**Not** raising the thresholds or deleting a rule because one finding annoyed someone. That silences the next real key too.",
        ]),
        challenge("chal_quiz_ssc_311"),

        h2("4. Worked example: from a hunk to line numbers"),
        p("Line numbers are where a hand-written scanner usually goes wrong. A hunk header gives the starting line in the old file and in the new file; after that you count. Here is a change to a different file of the platform:"),
        code("text", `
diff --git a/src/jobs/digest.ts b/src/jobs/digest.ts
index 4e1c2d0..b97a0f3 100644
--- a/src/jobs/digest.ts
+++ b/src/jobs/digest.ts
@@ -12,4 +12,5 @@ export async function sendWeeklyDigest(userId: string) {
   const user = await users.byId(userId);
-  const mailer = createMailer();
+  const mailer = createMailer({ apiKey: process.env.MAILER_KEY });
+  const unsubscribeSecret = "FAKE-unsubscribe-secret-0000";
   const courses = await progress.inProgress(userId);
   if (courses.length === 0) return;`, "git diff"),
        bullets([
            "`+12,5` means the hunk starts at line 12 of the new file and covers 5 new-file lines (`-12,4`: 4 lines of the old file).",
            "`const user` is context: line 12. The removed `createMailer()` line does not exist in the new file, so it takes no number.",
            "The first added line is 13, the second added line is 14, `const courses` is 15 and `if (courses...` is 16.",
            "Line 13: `apiKey: process.env.MAILER_KEY` is a reference, not a value, so `generic-secret` skips it. Line 14 is a finding: the name ends in `Secret` and the value has more than 8 characters.",
        ]),
        p("Two details from real diffs break naive parsers. First, a line that starts with `+++` or `---` **inside** a hunk is content: adding TOML front matter (`+++`) to a Markdown post produces the diff line `++++`, and removing a YAML separator produces `----`. Only before the first hunk of a file are those lines headers. Second, `\\ No newline at end of file` is a marker, not a line of either file."),
        p("In CI, the job is a few lines. It fetches enough history to compute the merge base, writes the diff to a file and fails on any finding:"),
        code("yaml", `
# .github/workflows/secrets.yml
name: secrets
on: pull_request
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: git diff --unified=3 origin/\${{ github.base_ref }}...HEAD > pr.diff
      - run: node scripts/scan-diff.mjs pr.diff --allow test/fixtures/ --allow package-lock.json`, "secrets.yml"),
        p("The scanner prints a masked preview, never the secret itself, for the same reason the next lesson masks configuration: CI logs are read by many people and kept for months. `AKIA... (20 chars)` is enough to find the line; the full value is already in the diff for whoever must fix it."),
        challenge("chal_coding_ssc_312"),

        h2("5. How to verify the scanner"),
        bullets([
            "**Canary fixtures.** Keep one fake value per rule in `test/fixtures/` (AWS's documented example key, strings containing FAKE) and a unit test that runs the scanner on a diff that adds them outside the allowed path. Each rule must produce exactly its finding; a refactor that breaks a regex fails the test, not production.",
            "**A planted pull request.** Once, open a pull request that adds a fake key in a fallback, and one that adds and then removes a fake key in two commits. The first must fail the diff job; the second shows whether your per-commit scan or push protection works.",
            "**Measure noise on real history.** Run the scanner over the diffs of the last 200 merged pull requests and count the findings. Every false positive is a decision: a narrower allowed path, a marker on that line, or a pattern fix - recorded in the pull request that changes the scanner.",
            "**After an incident, prove rotation.** In AWS, the old key is `Inactive` and then deleted, and CloudTrail shows no calls signed with it after the rotation time.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Scanning only the final diff or the current tree.** A key added and removed inside one branch is invisible to both. Spot it by running `git log --all -S <prefix>`: if it finds commits your scanner never flagged, scan per commit.",
            "**Treating deletion as the fix.** \"I removed it in the next commit\" leaves the secret valid. Spot it in the incident ticket: if there is no line saying when the key was revoked, the incident is not closed.",
            "**Allowed paths that are too wide.** `test/` or `**/*.json` hides real keys in test helpers and config files. Spot it by listing the allowed paths and asking, for each, what a real secret there would look like.",
            "**Printing the secret in the finding.** A scanner that logs the full match copies the secret into another place that needs cleaning. Spot it by grepping the job's log for the fixture values: only previews should appear.",
            "**Fixing noise by raising thresholds.** Moving base64 from 4.5 to 5.2 to silence a hash also silences most 40-character keys. Spot it in the scanner's change history: thresholds should change with measurements attached, not after one complaint.",
        ]),

        h2("7. Summary"),
        numbered([
            "Scan the added lines of every pull request, with the new file's line numbers, and also scan every pushed commit: the net diff hides secrets that were added and removed in the same branch.",
            "Patterns are precise for known formats (AWS, GitHub, Slack, private keys, assignments); entropy finds secrets with no format, at the cost of noise you must measure and handle with narrow allowed paths and one-line markers.",
            "A finding is the start, not the end: a secret that was pushed is compromised, so revoke and rotate it, then remove it from the code.",
        ]),

        h2("Sources"),
        bullets([
            "GitHub Docs: About secret scanning, and Push protection",
            "gitleaks (github.com/gitleaks/gitleaks): rules, allowlists and the gitleaks:allow inline marker",
            "TruffleHog: the original entropy check (base64 threshold 4.5, hex threshold 3.0, minimum length 20)",
            "AWS IAM User Guide: Manage access keys for IAM users (rotating access keys)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run gitleaks or TruffleHog over the full history of one of your own repositories and sort the findings into real, fixture and false positive. For each false positive, write down which of the three tools from this lesson you would use - a narrower allowed path, a one-line marker or a pattern fix - and why."),
    ],
});
