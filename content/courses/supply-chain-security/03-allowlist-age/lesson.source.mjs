// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-1-3",
    title: "Allowlists & package age: block what nobody approved",
    slug: { _type: "slug", current: "allowlists-package-age-block-unapproved" },
    description:
        "An automated update merged a patch release four hours after it was published, from a hijacked maintainer account, and an AI pull request added two packages nobody had ever approved. Learn why a new package name is a decision that needs a human, how scope wildcards differ from name prefixes, why a quarantine for fresh versions catches most hijacked releases, how to grant time-limited exceptions for urgent fixes, and build the dependency gate that decides allow or block with reasons.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "On Thursday the dependency bot opened a pull request that updated csv-writer-fast from 2.7.3 to 2.7.4 in the reporting service, four hours after 2.7.4 was published. Tests passed and the pull request was auto-merged. Six hours later the maintainers announced that 2.7.4 had been published with a stolen token and contained code that sent environment variables to a remote host; the registry removed it the next morning. The same week, an AI-assisted pull request to the web app added two dependencies nobody on the team had heard of. The platform lead asked for one gate in CI that answers, for every added or updated package: who approved this name, and has this version been public long enough for anyone to notice a problem?",
    },

    content: [
        h2("1. The incident: green tests, four hours old"),
        p("The bot's pull request had everything a reviewer looks for: a patch bump, a passing test suite, a changelog link. Here is what nobody looked at:"),
        code("bash", `
$ npm view csv-writer-fast time --json
{
  "2.7.2": "2026-04-11T09:12:40Z",
  "2.7.3": "2026-07-02T13:05:18Z",
  "2.7.4": "2026-10-22T05:51:02Z"
}

# pull request #2318 "chore(deps): bump csv-writer-fast from 2.7.3 to 2.7.4"
#   opened  2026-10-22T09:47Z   (3 h 56 min after publish)
#   merged  2026-10-22T10:02Z   (auto-merge: patch update, checks green)

# maintainers' advisory, 2026-10-22T16:20Z
#   "2.7.4 was not published by us. Do not install it. Use 2.7.3."`, "terminal and pull request timeline"),
        p("A hijacked release is usually noticed within hours or days: by the maintainers, by security scanners that watch new publishes, by the first users whose firewall complains. Anyone who installs in that window is the target. The bot installed it in the first four hours, because \"newest patch\" was its whole policy."),
        p("The second half of the week was a different problem. An AI-assisted pull request to the web app added these lines:"),
        code("json", `
   "dependencies": {
+    "markdown-sanitize-lite": "^1.0.0",
+    "dom-purify": "^3.1.0",
     "dompurify": "^3.2.7",`, "package.json (pull request #2325)"),
        p("Course E2 showed how to catch the first one by hand (it returns 404 today). This lesson is about the policy behind both: a **new name** in the dependency tree is a decision someone on the team should make once, on purpose, and a **new version** of an approved name should wait a few days before it runs on our machines."),
        callout("info", "About the names in this lesson",
            "The packages, versions, dates and tickets are fixtures made for the course; they show the patterns, not facts about the public registry."),

        h2("2. Reproduce it and read the evidence"),
        p("The gate needs three inputs, all of which you can produce in CI without installing anything:"),
        numbered([
            "**The dependency diff:** which packages the pull request adds or updates, and to which version. Compare the `packages` maps of the lockfile on the base branch and on the pull request (lesson 2), so transitive additions count too.",
            "**Registry metadata:** for each name and version, whether it exists and when it was published. `npm view <name> time --json` returns that map; the gate reads it from a snapshot so the decision is reproducible.",
            "**The policy:** the allowlist, the quarantine length in days, and the exceptions, committed in the repository and reviewed like code.",
        ]),
        code("json", `
{
  "allowlist": ["@codedev/*", "next", "react", "react-dom", "zod", "express", "marked", "dompurify", "csv-writer-fast"],
  "quarantineDays": 7,
  "exceptions": [
    { "name": "next", "version": "15.5.5", "ticket": "SEC-229", "expires": "2026-11-02" }
  ]
}`, "dependency-policy.json"),

        h2("3. Core idea: two questions for every change"),
        h3("Was this name approved? The allowlist"),
        p("An allowlist turns \"a dependency was added\" from an accident into a reviewed change of one file. It works because adding a name is rare and cheap to review, while every unreviewed name is a door: typosquats, invented names, abandoned packages. Two forms of entry are enough:"),
        bullets([
            "**An exact name:** `dompurify`. It does not match `dom-purify`, `dompurify-lite` or `DOMPurify`. npm names are lowercase, and a name that differs by one character is a different package owned by someone else.",
            "**A scope you own:** `@codedev/*`. Only members of the `codedev` organization on the registry can publish under `@codedev/`, so the wildcard covers code your own team publishes. The match must include the slash: `@codedev-labs/grader` is a different scope, owned by whoever registered it.",
        ]),
        callout("warning", "Never allow a prefix of an unscoped name",
            "An entry such as lodash* or eslint-plugin-* looks like a scope but is not one: anybody can publish lodash-deep-merge-pro or eslint-plugin-codedev tomorrow. Prefix wildcards are safe only for scopes whose publishers you control."),
        h3("Has anyone had time to notice? The quarantine"),
        p("A quarantine (also called a cooldown or minimum release age) blocks a version until it has been public for N days. It does not inspect code; it buys time for everyone else to inspect it. A few days covers the window in which most hijacked releases are reported and removed, but no number guarantees it: choose N from your own risk appetite, and remember it delays good fixes by the same N days."),
        p("Compute it on dates, not on durations, so the result does not depend on the hour the job runs: take the UTC calendar date of the publish instant, add N days, and block while today is earlier than that date. A timestamp written with an offset, such as `2026-10-16T02:30:00+07:00`, is `2026-10-15T19:30:00Z`, which is 15 October in UTC."),
        callout("info", "Your tools may already have this",
            "Several dependency tools offer a minimum release age, for example Renovate's minimumReleaseAge, and npm's own before setting installs only versions published on or before a given date. Check the current documentation of the tool you use. A gate in CI is still worth having: it also covers humans and AI assistants who edit package.json by hand."),
        h3("Exceptions: urgent, exact and temporary"),
        p("Sometimes you must install a version today: a security fix for an advisory that affects you. An exception lets one exact `name@version` through the allowlist and the quarantine, with a ticket that says who decided and why, and an expiry date after which it stops counting. Three rules keep exceptions from becoming permanent holes:"),
        bullets([
            "**Exact version, never a range.** An exception for `express@*` would also let through a hijacked `4.22.2` published tomorrow.",
            "**An expiry date.** After it, the version is old enough for the quarantine anyway, or the name should be on the allowlist through a normal review.",
            "**Never for registry facts.** An exception cannot make a version exist, or make an unreadable publish date readable. If the registry has no such version, nothing should install it.",
        ]),
        h3("Fail closed"),
        p("Every input the gate cannot read is a block: a package missing from the snapshot, a publish date that is not a timestamp, an expiry that is not a real date. A gate that allows what it cannot evaluate is a gate an attacker can walk around by sending odd data."),

        challenge("chal_quiz_ssc_131"),

        h2("4. Worked example: the decision for one change"),
        p("The gate decides each change on its own and prints one line per change, so a reviewer can read the result without opening the policy. Run on 22 October, the day of the bot's pull request, with a 7-day quarantine, the output for that week's changes should read like this:"),
        code("text", `
block csv-writer-fast@2.7.4 (was 2.7.3): quarantined until 2026-10-29 (published 2026-10-22)
block markdown-sanitize-lite@1.0.0: not in registry; not on allowlist
block dom-purify@3.1.0: not on allowlist; quarantined until 2026-10-24 (published 2026-10-17)
allow next@15.5.5 (was 15.5.4): exception SEC-229 (expires 2026-11-02)
allow @codedev/md-render@0.3.0
2 allowed, 3 blocked`, "dependency gate output"),
        p("The date arithmetic is where gates go wrong, so here it is on its own. Convert through `Date.parse` and `toISOString`, both of which work in UTC, and compare `YYYY-MM-DD` strings, which sort like the dates they represent:"),
        code("typescript", `
const DAY = 86_400_000;

function quarantineEnd(publishedAt: string, days: number): string {
    const utcDate = new Date(Date.parse(publishedAt)).toISOString().slice(0, 10);   // "2026-10-22"
    return new Date(Date.parse(\`\${utcDate}T00:00:00Z\`) + days * DAY).toISOString().slice(0, 10);
}

quarantineEnd("2026-10-22T05:51:02Z", 7);        // "2026-10-29"
quarantineEnd("2026-10-16T02:30:00+07:00", 7);   // "2026-10-22": published on 15 October in UTC
"2026-10-22" < quarantineEnd("2026-10-22T05:51:02Z", 7);   // true: blocked on the day of the pull request`, "quarantine.ts"),
        callout("warning", "Do not trust Date.parse with any string",
            "Date.parse also accepts formats such as \"Mon, 26 Oct 2026 10:00:00 GMT\", and some engines read a date-time without an offset as local time. Check the format with a regular expression first (date, time, then Z or an offset) and treat anything else as an unknown date."),
        p("Now build the whole gate: the registry lookup, the allowlist with exact names and owned scopes, the quarantine, and exceptions that lift only what they are allowed to lift."),
        challenge("chal_coding_ssc_132"),

        h3("Where the gate runs"),
        p("The gate is one more step before `npm ci`, in the same job that already checks the lockfile. It reads the lockfile of the base branch and of the pull request, fetches publish dates for the changed packages only (a handful of `npm view` calls), and fails the job when anything is blocked:"),
        code("yaml", `
# .github/workflows/ci.yml (dependency job, pull requests only)
- run: git show origin/\${{ github.base_ref }}:package-lock.json > base-lock.json
- run: node scripts/dependency-diff.mjs base-lock.json package-lock.json > changes.json
- run: node scripts/registry-snapshot.mjs changes.json > registry.json    # npm view <name> time --json
- run: node scripts/dependency-gate.mjs dependency-policy.json changes.json registry.json >> "$GITHUB_STEP_SUMMARY"
- run: npm ci --ignore-scripts`, "ci.yml"),
        p("Saving the registry snapshot as a build artifact makes every decision reproducible: a week later you can rerun the gate on the same inputs and get the same lines, even after the registry removed a version. Changes to `dependency-policy.json` itself should require a review from the code owners of the platform team, or the allowlist is one commit away from `*`."),

        h2("5. How to verify"),
        bullets([
            "**Replay the incident.** Keep the snapshot of the incident week as a fixture; the gate must block `csv-writer-fast@2.7.4` on 22 October and allow it (if it still existed) eight days later.",
            "**Boundary dates.** One test where the quarantine ends exactly today (allowed), one where it ends tomorrow (blocked), one with a `+07:00` timestamp that falls on the previous UTC day, and one with an exception that expires today (still valid).",
            "**Lookalike scopes and prefixes.** `@codedev-labs/x` and `@codedevs/x` must be blocked when only `@codedev/*` is allowed; `lodash.merge` when only `lodash` is allowed.",
            "**Fail closed.** Feed the gate an unknown version, a publish date such as `last week` and an expiry such as `2026-04-31`: all three must block.",
            "**In CI, the result is visible.** Print the decision lines in the job summary, so the reviewer sees `quarantined until ...` instead of a red cross with no reason.",
        ]),

        h2("6. Common mistakes, and how to spot them"),
        bullets([
            "**Matching a scope without its slash.** `name.startsWith(\"@codedev\")` also allows `@codedev-labs/...`. Spot it: a test with a lookalike scope.",
            "**Exceptions for a whole package.** `{ name: \"express\" }` with no version lifts the quarantine for every future release. Spot it: an exception schema where `version` is optional.",
            "**Exceptions without expiry.** They pile up and nobody remembers why. Spot it: exceptions older than the quarantine itself still in the policy file.",
            "**Measuring age in local time or in hours.** The same version is allowed or blocked depending on the runner's time zone or the hour of the build. Spot it: a timestamp with an offset near midnight gives different answers on two machines.",
            "**Checking only `package.json`.** Transitive additions and updates arrive through the lockfile. Spot it: the gate's input is the manifest diff, not the lockfile diff.",
        ]),

        h2("7. Summary"),
        bullets([
            "A new name is a decision: allow exact names, and wildcards only for scopes you own (with the slash); everything else is blocked until a reviewed change adds it to the allowlist.",
            "A new version waits: a quarantine of a few days, computed on UTC calendar dates, keeps you out of the window in which most hijacked releases are found and removed.",
            "Exceptions are exact, ticketed and expiring, and never override registry facts; anything the gate cannot read blocks.",
        ]),

        h2("Sources"),
        bullets([
            "npm documentation: npm view (the time field), and the before config - docs.npmjs.com",
            "Renovate documentation: minimumReleaseAge",
            "SLSA specification, threats overview (dependency threats) - slsa.dev",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the dependency-policy.json for one of your projects from its current lockfile: which names would you allowlist, which scopes do you really own? Then compute, from npm view <name> time --json, how many of your last 20 dependency updates would have been delayed by a 7-day quarantine, and by how long."),
    ],
});
