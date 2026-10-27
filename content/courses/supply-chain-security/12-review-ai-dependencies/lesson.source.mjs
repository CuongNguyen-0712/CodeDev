// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-4-3",
    title: "Reviewing AI-suggested dependencies before they land",
    slug: { _type: "slug", current: "review-ai-suggested-dependencies" },
    description:
        "An AI assistant solved a 3-column CSV import by adding a nine-day-old package with a postinstall script and 41 transitive dependencies, and the pull request was one approval away from merging. Build the review checklist for AI-suggested dependencies (does it exist, who publishes it, age and downloads, scope ownership, install scripts, transitive footprint, license), turn it into one CI job that combines the checks of this course, and learn when writing 20 lines yourself is the safer dependency.",
    estimatedTime: 20,

    scenario: {
        role: "Tech lead and reviewer, CodeDev learning platform",
        problem:
            "Instructors want to upload grades from the CodeDev exporter as a CSV file. A developer asks an AI coding assistant for the import endpoint of https://api.codedev.test; the assistant writes the endpoint and adds fast-csv-parse-pro@1.0.3 to package.json. Tests pass, the diff of the source code is short and clear, and the pull request already has one approval. The second reviewer opens the lockfile diff and the CI output of the dependency checks: the package was published nine days ago by an account with one package, it runs a postinstall script, and it adds 41 packages to the lockfile.",
    },

    content: [
        h2("1. The incident: a clean diff with a heavy dependency"),
        p("The request to the assistant was precise:"),
        code("text", `
Add POST /instructor/grades/import. The body is grades.csv produced by our own exporter:
header "studentId,lessonId,score", then one row per grade, integers only, no quotes,
no commas inside fields, at most 5,000 rows. Reject the file if any row is invalid.`, "prompt"),
        p("The code it wrote is readable and tested. The dependency it chose is the problem:"),
        code("text", `
 package.json
+    "fast-csv-parse-pro": "^1.0.3",

 package-lock.json
 (Large diff not rendered by default: 1,204 lines changed)

dependency-review / check (pull_request)
  fast-csv-parse-pro@1.0.3
    exists .............. yes   https://www.npmjs.com/package/fast-csv-parse-pro
    first published ..... 9 days ago                     FAIL  (policy: 30 days)
    maintainers ......... 1 (account created 11 days ago, 1 package)
    repository .......... none
    install scripts ..... postinstall: "node setup.js"   FAIL  (not on the scripts allowlist)
    lockfile ............ +41 packages, 3 of them with install scripts
    license ............. "SEE LICENSE IN LICENSE.txt"   REVIEW`, "PR #1931"),
        p("Nothing here proves the package is malicious. It may be a sincere new project. But nobody on the team chose it: an assistant did, for a problem that did not need a library, and the code review covered the 60 lines the assistant wrote, not the 41 packages it brought in. Assistants pick dependencies by how plausible a name looks in context. They do not check the registry, and they can name packages that do not exist (slopsquatting, lesson 2.2). The review is where a human makes the decision the assistant could not make."),

        h2("2. Read the evidence yourself"),
        p("Every line of that CI output can be reproduced by hand in a few commands, and you should know them before you trust a tool that runs them:"),
        code("bash", `
# Does it exist, who publishes it, how old is it, where is the source?
npm view fast-csv-parse-pro name version license maintainers repository.url time.created

# Does any version run code at install time?
npm view fast-csv-parse-pro scripts

# How many people use it? (a weak signal: downloads can be inflated)
curl -s https://api.npmjs.org/downloads/point/last-week/fast-csv-parse-pro

# What does it pull in? Install into a throwaway copy without running scripts.
npm install fast-csv-parse-pro --ignore-scripts --dry-run

# After installing on the branch: which packages in the lockfile run install scripts?
jq -r '.packages | to_entries[] | select(.value.hasInstallScript) | .key' package-lock.json`, "terminal"),

        h2("3. Core idea: the review checklist"),
        p("Treat a dependency suggested by an assistant like a dependency suggested by a stranger in a forum: possibly great, unverified. The checklist has seven questions. Each one has a command or a field that answers it, so it can become a CI check instead of a reviewer's memory."),
        numbered([
            "**Does it exist, under exactly this name?** A 404 means the name was invented. Reject it and put the name on a deny list: the same name tends to come back in other answers, and anyone can register it tomorrow. A name one edit away from a popular one (`expres`, `lodahs`) is the typosquat check of lesson 2.2.",
            "**Who publishes it?** Look at the maintainers, the linked repository and whether the published package matches it. Provenance, where the registry shows it, links a version to the CI workflow and commit that built it. A brand-new account with one package and no repository is not proof of malice, but it is a reason for a closer look.",
            "**How old is it, and is anyone using it?** A first release a few days old has not been looked at by anyone else yet; a minimum age (lesson 1.3) gives the registry and the community time to catch malicious versions. Downloads help a little and can be faked; treat them as a tiebreaker, never as approval.",
            "**Who owns the scope?** `@codedev/...` is owned by whoever registered `@codedev` on that registry. Check that your `.npmrc` maps your own scopes to your registry, so a public package cannot stand in for an internal one (lessons 2.1 and 3.3).",
            "**Does it run code at install time?** `preinstall`, `install` and `postinstall` scripts run with the permissions of whoever installs: developers' machines and CI runners with tokens. With install scripts disabled by default (lesson 2.3), a new script needs an explicit entry on the allowlist and a reason.",
            "**What is its transitive footprint?** Count the packages it adds to the lockfile, and how many of those have install scripts. Every one is code you now ship, update and appear in your SBOM diff for (lesson 4.1).",
            "**What license does it use?** `MIT` or `Apache-2.0` are usually on the allowlist; `SEE LICENSE IN ...`, a missing license or a source-available license need someone who can decide. Licenses can change on a major upgrade, which the SBOM diff reports.",
        ]),
        callout("info", "Ask the assistant better questions, then verify the answers",
            "You can make suggestions better at the source: ask for the standard library first, for a link to the package's registry page and repository, and for the reason a dependency is needed at all. Then verify the answers with the commands above. An assistant's statement that a package is \"popular\" or \"well maintained\" is a claim to check, not evidence."),
        challenge("chal_quiz_ssc_431"),

        h2("4. Make the checklist automatic"),
        p("A checklist that lives in a reviewer's head is skipped on busy days. Every question above maps to a check from this course; together they form one job that runs on every pull request that touches `package.json` or the lockfile:"),
        code("yaml", `
# .github/workflows/dependency-review.yml
name: dependency-review
on:
  pull_request:
    paths: ["package.json", "package-lock.json", ".npmrc"]
permissions:
  contents: read                                     # lesson 3.3: read-only token for PR jobs
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: Lockfile in sync, exact installs           # lesson 1.2
        run: npm ci --ignore-scripts
      - name: New packages, ranges, allowlist, minimum age   # lessons 1.2 and 1.3
        run: node scripts/deps/check-new-packages.mjs --base origin/\${{ github.base_ref }} --min-age-days 30
      - name: Names (deny list, typosquats, scope mapping)   # lessons 2.1, 2.2, 3.3
        run: node scripts/deps/check-names.mjs --deny scripts/deps/denylist.txt --npmrc .npmrc
      - name: Install scripts not on the allowlist           # lesson 2.3
        run: node scripts/deps/check-install-scripts.mjs --allow scripts/deps/scripts-allowlist.json
      - name: Secrets in the diff                            # lesson 3.1
        run: node scripts/secrets/scan-diff.mjs --base origin/\${{ github.base_ref }}
      - name: SBOM diff and license policy                   # lesson 4.1
        run: |
          npm sbom --sbom-format cyclonedx --omit dev > head.cdx.json
          node scripts/deps/sbom-diff.mjs base.cdx.json head.cdx.json --policy scripts/deps/policy.json   # base.cdx.json: SBOM of the target branch`, "dependency-review.yml"),
        bullets([
            "**Run it with install scripts off and a read-only token.** The job inspects untrusted packages; it must not execute them with credentials in reach.",
            "**Fail with a reason a human can act on.** \"fast-csv-parse-pro: first published 9 days ago, policy 30\" leads to a decision; \"dependency check failed\" leads to a retry.",
            "**Make exceptions explicit and reviewed.** Allowlist entries for names and install scripts live in the repository, with an owner and a reason, and changes to them need a code owner's approval. An exception that anyone can add in the same pull request is not a check.",
            "**Keep the base for comparison.** Checks such as \"new packages\" and the SBOM diff compare the pull request with the target branch, so a release with 1,800 packages produces a review of the five that changed.",
        ]),
        p("Hosted options exist too, for example GitHub's dependency review action, which reports new dependencies, known vulnerabilities and licenses on pull requests. They cover part of the list; age, scope mapping and install scripts usually still need your own small scripts. Check what your tool actually verifies before you remove one of your own checks."),

        h2("5. When to write the 20 lines yourself"),
        p("The cheapest dependency to review is the one you do not add. For the grades import, the format is fixed by the team's own exporter: split on newlines, split on commas, check the header, check that three fields are integers, count rows. That is about 20 lines plus a test per rule, and it adds nothing to the lockfile, the SBOM or the install-script allowlist."),
        h3("Write it yourself when"),
        bullets([
            "**The input is yours and fully specified,** like an internal export with no quoting, or a config file you define.",
            "**The code is short and you can test all of it,** a few dozen lines at most, each rule with its own test.",
            "**The standard library already does most of it.** Modern Node.js covers many old micro-packages: `crypto.randomUUID()` for UUIDs, `structuredClone` for deep copies, `util.parseArgs` for command-line flags, global `fetch`, the `URL` class, and `node:test` for tests (check the Node.js version you run).",
        ]),
        h3("Use an established library when"),
        bullets([
            "**The format has hard edge cases or comes from users:** CSV with quotes, escaped quotes and newlines inside fields, dates and time zones, Unicode, HTML sanitizing, URL parsing beyond the `URL` class.",
            "**Mistakes are security bugs:** cryptography, password hashing, JWT and session handling, authorization. Do not write these from scratch, and do not let an assistant write them from scratch either.",
            "**Prefer one already in your tree.** A library that is already in the lockfile, reviewed and owned, adds no new publisher. Check `npm ls <name>` before adding a second CSV parser next to the first.",
        ]),
        callout("warning", "Writing it yourself is not free either",
            "Your own code needs tests, an owner and updates when the format changes. The decision is a trade: a short, specified, testable function against a new publisher, an install script and a transitive tree. For anything larger or riskier than that, the established library wins, and the checklist above tells you whether this particular one deserves your trust."),

        h2("6. How to verify the process"),
        bullets([
            "**Replay a known bad suggestion.** On a test branch, add a package name that returns 404, a scoped name your `.npmrc` does not map and a package with a postinstall script: each must fail its check with a clear reason.",
            "**Audit the exceptions.** List the allowlist entries for names and install scripts with their owner and reason; entries without one are candidates for removal.",
            "**Measure the footprint.** For every dependency added in the last quarter, count the packages it brought into the lockfile. Large numbers for small features are where writing it yourself would have paid off.",
            "**Read the assistant's suggestions in your pull requests.** Search merged pull requests for dependencies added together with AI-written code, and run the checklist on them after the fact.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Reviewing the code and skipping the lockfile.** The source diff is short; the risk is in the collapsed lockfile. Spot it: approvals on pull requests whose lockfile diff is larger than the code diff, with no dependency check in CI.",
            "**Treating a familiar scope or name as identity.** `@codedev/...` or a name close to a popular package proves nothing about the publisher. Spot it: no `.npmrc` mapping for your scopes, no typosquat check.",
            "**Using downloads as approval.** Download counts are easy to inflate and say nothing about the latest version. Spot it: \"it has 50k weekly downloads\" as the only reason in the pull request.",
            "**Exceptions added in the same pull request.** An allowlist entry added by the author of the change, without a code owner, turns the check off. Spot it: allowlist files without CODEOWNERS protection.",
            "**Adding a library for a problem you own.** Spot it: a new dependency whose job is to parse a format your own code writes.",
        ]),

        h2("8. Summary"),
        numbered([
            "An AI-suggested dependency is an unverified suggestion: check that it exists, who publishes it, its age, the owner of its scope, its install scripts, its transitive footprint and its license.",
            "Turn the checklist into one CI job built from the checks of this course (lockfile, allowlist and age, names and scopes, install scripts, secrets, SBOM diff), running with scripts off and a read-only token, with reviewed exceptions.",
            "When the input is yours, the logic is short and testable, write the 20 lines; for hard formats and anything security-critical, use an established library, preferably one you already trust.",
        ]),

        h2("Sources"),
        bullets([
            "npm documentation: npm view, npm install --ignore-scripts and package-lock.json - docs.npmjs.com",
            "npm documentation: provenance statements and npm audit signatures - docs.npmjs.com",
            "SLSA specification - slsa.dev",
            "GitHub documentation: dependency review - docs.github.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last three dependencies added to a project you work on and run the seven questions on each, with the commands from section 2. Write down which ones you would still add, which ones you could replace with the standard library or a package already in the tree, and which check your CI does not have yet. Then ask an AI assistant for a library to solve a small task in that project and review its answer the same way before you install anything."),
    ],
});
