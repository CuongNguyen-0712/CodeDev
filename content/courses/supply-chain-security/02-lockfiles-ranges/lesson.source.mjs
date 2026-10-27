// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-1-2",
    title: "Lockfiles & version ranges: what you actually install",
    slug: { _type: "slug", current: "lockfiles-version-ranges-what-you-install" },
    description:
        "A pull request added sanitize-html with the range >=2.11.0 and no lockfile change; CI ran npm install, resolved a new major version at build time and broke comment rendering on staging. Learn what package-lock.json v3 records (version, resolved, integrity per installed path), why npm ci and not npm install, how ^, ~ and x-ranges behave (0.x included), why integrity proves less than it seems, and build a CI check that compares package.json with the lockfile.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "After release 2026.10.3, lesson comments on staging (https://app.codedev.test) rendered as plain text with the HTML tags escaped. The pull request that added HTML sanitizing to comments changed package.json with \"sanitize-html\": \">=2.11.0\" (an AI assistant's suggestion) but did not commit package-lock.json. The developer had tested with 2.13.1. The CI job ran npm install, which found no lock entry, resolved the range against the registry and installed the brand-new 3.0.0, whose defaults changed. The lockfile written during the job was thrown away with the runner, so nobody could tell from the repository which version had shipped.",
    },

    content: [
        h2("1. The incident: a range nobody read"),
        p("The diff of the pull request looked harmless. One line in `package.json`, and a lot of code that used the new package:"),
        code("json", `
   "dependencies": {
     "marked": "^14.1.0",
+    "sanitize-html": ">=2.11.0",
     "next": "15.5.4",`, "package.json (pull request #2291)"),
        p("Two things are wrong, and neither is visible in a code review that only reads `.ts` files. The range `>=2.11.0` has no upper bound: it accepts 2.13.1, 3.0.0 and 47.0.0. And `package-lock.json` is not in the diff, so the version the developer tested is recorded nowhere. The CI job did what it was told:"),
        code("text", `
Run npm install
added 1 package, changed 3 packages, and audited 913 packages in 6s
found 0 vulnerabilities

Run npm run build
...
Run npm ls sanitize-html
codedev-web@2026.10.3
\`-- sanitize-html@3.0.0`, "CI log, build job (run 18907)"),
        p("Version 3.0.0 had been published two days earlier with new defaults. The code from the pull request was written against 2.x, and staging rendered every comment as escaped text. Nothing failed: the build passed, the tests passed (they mocked the sanitizer), and the only record of 3.0.0 was a line in a CI log."),

        h2("2. Reproduce it and read the evidence"),
        p("Run the same build with `npm ci` instead of `npm install` and it stops on the first line, which is the point:"),
        code("text", `
$ npm ci
npm error code EUSAGE
npm error \`npm ci\` can only install packages when your package.json and package-lock.json
npm error or npm-shrinkwrap.json are in sync. Please update your lock file with \`npm install\`
npm error before continuing.
npm error
npm error Missing: sanitize-html@3.0.0 from lock file`, "terminal"),
        p("Now look at what a lockfile records for a package that *is* in it. In lockfile version 3 (npm 7 and later write v2 or v3; v3 drops the old `dependencies` section), everything lives in one `packages` map whose keys are install paths:"),
        code("json", `
{
  "name": "codedev-web",
  "lockfileVersion": 3,
  "packages": {
    "": { "name": "codedev-web", "dependencies": { "marked": "^14.1.0", "next": "15.5.4" } },
    "node_modules/marked": {
      "version": "14.1.2",
      "resolved": "https://registry.npmjs.org/marked/-/marked-14.1.2.tgz",
      "integrity": "sha512-FAKEFAKEFAKE...base64-of-the-tarball-hash...==",
      "license": "MIT"
    },
    "node_modules/express/node_modules/qs": {
      "version": "6.13.0",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.13.0.tgz",
      "integrity": "sha512-FAKEFAKEFAKE...==",
      "dev": true
    },
    "node_modules/@codedev/ui": { "resolved": "packages/ui", "link": true }
  }
}`, "package-lock.json (shortened)"),
        bullets([
            "**`\"\"`** is the project itself, with the ranges copied from `package.json`.",
            "**`node_modules/<name>`** is a package installed at the top level; this is the copy your code imports. A key such as `node_modules/express/node_modules/qs` is a second copy nested under `express`, because express needs a version of `qs` that differs from the top-level one.",
            "**`version`** is the exact version that will be installed. **`resolved`** is where the tarball is downloaded from. **`integrity`** is a Subresource Integrity hash (`sha512-` plus base64) of that tarball; npm refuses a download whose hash differs.",
            "**`dev: true`** marks packages needed only by devDependencies; **`link: true`** marks a workspace symlink (a folder of your own monorepo), which has no tarball and no integrity.",
        ]),

        h2("3. Core idea: the range is a policy, the lockfile is the decision"),
        p("`package.json` says which versions you are *willing* to accept. `package-lock.json` says which version you *accepted*, for every package in the tree, transitive ones included. Supply chain safety needs both: a sane range, so that the next update is a small step, and a lockfile that only changes in a reviewed pull request, so that no build installs something nobody saw."),
        h3("npm ci versus npm install"),
        bullets([
            "**`npm ci`** installs exactly what the lockfile says, deletes `node_modules` first, never writes the lockfile, and fails when `package.json` and the lockfile disagree. Use it in CI, in Dockerfiles and in deploy scripts.",
            "**`npm install`** keeps a locked version that still satisfies the range, but resolves anything missing or out of range against the registry and writes the result back to the lockfile. Use it on your machine when you mean to change dependencies, then commit the lockfile in the same pull request.",
        ]),
        h3("Ranges in npm's semver, the subset you will meet most"),
        code("text", `
1.2.3           exactly 1.2.3
^1.2.3          >=1.2.3 <2.0.0   (minor and patch updates)
^0.2.3          >=0.2.3 <0.3.0   (below 1.0.0 the caret is stricter: the first non-zero part is fixed)
^0.0.3          >=0.0.3 <0.0.4
~1.2.3          >=1.2.3 <1.3.0   (patch updates)
1.2.x  1.2.*  1.2   >=1.2.0 <1.3.0
1.x    1.*    1     >=1.0.0 <2.0.0
>=1.2.0 <1.5.0  an explicit pair
*  x  ""        any version
>=2.11.0        any version from 2.11.0 up - no upper bound
latest          not a range at all: a dist-tag, whatever the maintainer tagged last`, "npm semver ranges"),
        p("Two details matter for a checker. A version with a prerelease tag such as `2.0.0-rc.1` does **not** satisfy `^2.0.0` or `>=1.0.0` by default: npm only matches prereleases against a range that names a prerelease of the same `major.minor.patch`. And many specs in `package.json` are not version ranges at all: `latest` and other dist-tags, `github:owner/repo#main`, `git+ssh://...`, a tarball URL, `npm:other@1.0.0` aliases. Their content is decided by whoever controls the tag, the branch or the URL, not by your review."),
        callout("info", "When exact pins and wide ranges are fine",
            "Applications (the CodeDev web app, the API, a CLI you deploy) should commit a lockfile and keep caret or tilde ranges. Libraries you publish to npm do not ship their lockfile to users, so their ranges must stay reasonably wide or every consumer ends up with duplicate copies. A range with no upper bound is almost never right in either case: it promises compatibility with versions that do not exist yet."),
        h3("Integrity proves less than it seems"),
        p("`integrity` makes sure the tarball you download is the one the lockfile describes. It does not make sure the lockfile describes the right tarball. A pull request that changes `resolved` to another host *and* updates `integrity` to match passes `npm ci` without a warning. Lockfile diffs are long, GitHub collapses them by default, and reviewers skip them; that is exactly why a machine should read them. Since npm 9, npm swaps only the `registry.npmjs.org` host in `resolved` for your configured registry (the `replace-registry-host` setting); any other host in the lockfile is used as written."),

        h3("Why AI-written changes make this worse"),
        p("Coding assistants write `package.json` edits from patterns in their training data, not from your registry. In CodeDev's own pull requests the same three habits came up again and again: ranges such as `>=2.11.0` or `latest` (\"so it always gets the newest\"), version numbers that look plausible but were never published, and a manifest change without the matching lockfile change, because the assistant edited a file instead of running `npm install`. None of these is visible in a review of the application code. All three are visible to a script that reads both files:"),
        code("text", `
missing sanitize-html: >=2.11.0
wide-range sanitize-html: >=2.11.0 (no upper bound)
2 finding(s)`, "lockfile check on pull request #2291"),
        p("The fix is boring on purpose: run `npm install <name>@<range>` locally, read the lockfile diff it produces (how many packages did one line bring in?), and commit both files together."),

        challenge("chal_quiz_ssc_121"),

        h2("4. Worked example: the check in CI"),
        p("The fix for the incident has two parts. First, the build installs only from the lockfile:"),
        code("yaml", `
# .github/workflows/ci.yml (build job)
- uses: actions/setup-node@v4
  with:
    node-version: 24
- run: node scripts/check-lockfile.mjs      # fails the job on any finding
- run: npm ci --ignore-scripts
- run: npm run build`, "ci.yml"),
        p("Second, a small script reads `package.json` and `package-lock.json` before `npm ci` and reports what a reviewer would miss. The heart of it is turning a range into two bounds and comparing version tuples:"),
        code("typescript", `
type V = [number, number, number];
type Range = { lower: V | null; upper: V | null; upperInclusive: boolean } | null;

const parse = (v: string): V | null => {
    const m = /^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a: V, b: V) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// only tilde shown here; the challenge needs the whole subset
function tilde(spec: string): Range {
    const v = parse(spec.slice(1));
    return v ? { lower: v, upper: [v[0], v[1] + 1, 0], upperInclusive: false } : null;
}

const r = tilde("~5.8.0");
console.log(r && cmp(parse("5.8.3")!, r.upper!) < 0);   // true:  5.8.3 is inside
console.log(r && cmp(parse("5.9.0")!, r.upper!) < 0);   // false: 5.9.0 is outside`, "range.ts"),
        p("The full check reports five kinds of findings, sorted so that two runs on the same files print the same thing:"),
        numbered([
            "**missing:** a dependency of `package.json` with no `node_modules/<name>` entry in the lockfile (the incident).",
            "**wide-range:** a spec with no upper bound, or one the checker cannot read as a version range (dist-tags, git and URL specs).",
            "**mismatch:** the locked version does not satisfy the range - the two files drifted apart.",
            "**registry:** an installed package whose `resolved` URL does not start with an allowed registry (http instead of https, a lookalike host, a git URL).",
            "**integrity:** an installed package with no integrity hash.",
        ]),
        challenge("chal_coding_ssc_122"),

        h2("5. How to verify"),
        bullets([
            "**`npm ci` fails on drift.** Delete a line from the lockfile in a scratch branch and run `npm ci`: it must stop with the \"in sync\" error. If your build passes, it is not using the lockfile.",
            "**What is installed, and why:** `npm ls <name> --all` shows the version and the path; compare it with the lock entry.",
            "**The registry hosts in the lockfile:** `grep -o '\"resolved\": \"[^\"]*' package-lock.json | cut -d/ -f3 | sort | uniq -c` lists every host; anything other than your registries is a finding.",
            "**Lockfile changes in a pull request:** `git diff --stat main -- package-lock.json` makes a hidden 2,000-line change visible; tools such as lockfile-lint automate the host and scheme checks.",
            "**Your checker:** feed it a lockfile with each kind of problem planted, as the hidden tests of the challenge do, and keep those fixtures in the repository.",
        ]),

        h2("6. Common mistakes, and how to spot them"),
        bullets([
            "**`npm install` in CI.** It quietly repairs drift instead of failing on it. Spot it: grep workflows and Dockerfiles for `npm install` and `npm i `.",
            "**Lockfile not committed, or in `.gitignore`.** Every build resolves fresh. Spot it: `git ls-files package-lock.json` prints nothing.",
            "**Treating `^0.x` like `^1.x`.** `^0.4.1` stops before `0.5.0`, not before `1.0.0`. A checker that gets this wrong reports a mismatch as fine. Spot it: a test with `^0.4.1` and a locked `0.5.0`.",
            "**Checking the registry with `includes` or a host without a trailing slash.** `https://mirror.example/https://registry.npmjs.org/pkg.tgz` contains the registry URL, and `https://registry.npmjs.org.mirror.example/` starts with the host name. Spot it: compare with `startsWith` against the full prefix, slash included.",
            "**Reading only direct dependencies.** Nested entries (`node_modules/a/node_modules/b`) are downloaded too. Spot it: your checker never looks at keys with two `node_modules/` segments.",
        ]),

        h2("7. Summary"),
        bullets([
            "The range in `package.json` is the policy; the lockfile, with exact versions, `resolved` URLs and integrity hashes for every installed path, is the decision - and `npm ci` is the only install that respects it.",
            "Ranges with no upper bound, dist-tags, git and URL specs hand the decision to someone else; `^` is stricter below 1.0.0, and prereleases do not match ordinary ranges.",
            "Integrity proves that the download matches the lockfile, not that the lockfile is right: check hosts, missing entries and drift automatically before `npm ci`.",
        ]),

        h2("Sources"),
        bullets([
            "npm documentation: package-lock.json (lockfileVersion, packages, resolved, integrity) - docs.npmjs.com/cli/v10/configuring-npm/package-lock-json",
            "npm documentation: npm ci, and the replace-registry-host config",
            "node-semver README (npm's semver implementation): ranges, caret and tilde, prerelease tags",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run your checker on a real project's package-lock.json. Then extend it: flag integrity values that contain only a sha1- hash (old lockfiles), and flag a spec in package.json whose lock entry is marked dev: true while the package is listed under dependencies."),
    ],
});
