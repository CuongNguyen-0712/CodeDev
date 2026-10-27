// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-4-1",
    title: "Packages that don't exist: checking AI-suggested dependencies",
    slug: { _type: "slug", current: "packages-that-dont-exist-checking-ai-dependencies" },
    description:
        "An AI pull request for Markdown comments added a package that returned 404, a lookalike of dompurify that ran a postinstall script, and a package published six days earlier. Learn why language models invent package names, what slopsquatting and typosquatting are, why a green install and a lockfile prove nothing about the right package, and how to check every suggested dependency against the registry before it reaches CI.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer and reviewer, CodeDev learning platform",
        problem:
            "A developer asked an AI coding assistant to add Markdown with safe HTML to lesson comments on https://app.codedev.test. The pull request added six dependencies. CI failed on the first run with a 404 for one of them; the developer removed that line, CI went green, and the pull request was approved. Two days later the security channel flagged an outbound request from a CI runner to an unknown host during npm install. It came from the postinstall script of dom-purify, a package first published nine days before the pull request, which the assistant had written instead of dompurify.",
    },

    content: [
        h2("1. The incident: six dependencies nobody looked up"),
        p("The request was reasonable: \"Lesson comments should support Markdown. Render it to HTML and sanitize the HTML so learners cannot inject scripts. Add a CSV export of comments for moderators.\" The assistant produced working-looking code and this change to `package.json`:"),
        code("json", `
  "dependencies": {
+   "marked": "^14.1.0",
+   "dompurify": "^3.1.0",
+   "dom-purify": "^3.1.0",
+   "isomorphic-purify": "^2.3.0",
+   "markdown-sanitize-lite": "^1.0.0",
+   "csv-stringify": "^7.0.0",
    "next": "15.5.4",`, "package.json (AI pull request)"),
        p("Read it as a reviewer would have to. `marked` and `dompurify` are well known. `dom-purify` is one hyphen away from `dompurify`, and both are in the list, which no human would write on purpose. `isomorphic-purify` sounds plausible. `markdown-sanitize-lite` is a name you have never heard of. `csv-stringify` exists, but does version 7 exist? Every one of those lines is a decision to run someone else's code on every developer laptop, every CI runner and, through the bundle, in learners' browsers. Nobody looked any of them up."),
        p("What happened next is typical. The first CI run failed on `isomorphic-purify` with a 404. The developer deleted that line, the next run passed, and the reviewer saw a green check. The lookalike package installed without an error, because it existed: someone had published it nine days earlier."),
        callout("info", "About the names in this lesson",
            "The package names, dates and download counts in this lesson and its challenge come from a registry snapshot made for the course. They illustrate the patterns; they are not statements about packages on the real npm registry today. Check real names yourself with the commands in section 5."),

        h2("2. Reproduce it and read the evidence"),
        p("Every claim about a dependency can be checked in seconds with `npm view`, which reads the registry without installing anything. Start with the name that broke CI:"),
        code("bash", `
$ npm view isomorphic-purify
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/isomorphic-purify - Not found
npm error 404 The requested resource 'isomorphic-purify@*' could not be found or you do not have permission to access it.`, "terminal"),
        p("Now the name that installed. `npm view <name> time` lists every version with its publish date, and the registry's download API gives the weekly count:"),
        code("bash", `
$ npm view dom-purify time --json
{ "created": "2026-10-17T03:12:40.511Z", "3.1.0": "2026-10-17T03:12:41.002Z", ... }

$ npm view dom-purify scripts
{ postinstall: 'node scripts/setup.js' }

$ curl -s https://api.npmjs.org/downloads/point/last-week/dom-purify
{"downloads":212,"start":"2026-10-16","end":"2026-10-22","package":"dom-purify"}

$ curl -s https://api.npmjs.org/downloads/point/last-week/dompurify
{"downloads":9046117,"start":"2026-10-16","end":"2026-10-22","package":"dompurify"}`, "terminal"),
        p("Three facts are enough to stop the merge: the name is a separator away from a package with millions of weekly downloads, it is nine days old with a few hundred downloads, and it runs a script during `npm install`. The CI log had shown the script running all along:"),
        code("text", `
added 6 packages, and audited 912 packages in 4s
> dom-purify@3.1.0 postinstall
> node scripts/setup.js
found 0 vulnerabilities`, "CI log, npm install"),
        p("`found 0 vulnerabilities` is true and irrelevant. `npm audit` compares installed versions with published security advisories. A package that was written to steal environment variables last week has no advisory yet."),

        h2("3. Why assistants invent packages, and who is waiting for that"),
        p("A language model writes the most likely next tokens. For an import line, a likely name is one that looks like the names in its training data: a known prefix, a known suffix, a common word in between. `isomorphic-` is a real prefix, `purify` is a real word in this field, so `isomorphic-purify` is a very likely string. Whether a package with that name was ever published is a fact about the registry, and the model has no registry at hand unless a tool gives it one."),
        p("This is measurable. A 2025 study (Spracklen et al., presented at USENIX Security 2025) generated code with 16 language models and checked every package the code referenced: about **19.7%** of the suggested package names did not exist. Many of the invented names came back again when the same prompt was repeated, which is what makes them useful to an attacker."),
        h3("Three kinds of bad name"),
        bullets([
            "**Typosquatting.** An attacker publishes a name a human might mistype: `loadsh` for `lodash`, `expres` for `express`. The old attack, aimed at people.",
            "**Separator and scope tricks.** The same name with a different separator or a fake scope: `cross_env` or `crossenv` for `cross-env`, `@types-node` or `types-node` for `@types/node`. npm treats each one as a different package. In 2017 npm removed a set of typosquatting packages, among them `crossenv`, that sent the environment variables of the machine that installed them to a remote server.",
            "**Slopsquatting.** An attacker registers a name that AI assistants **invent**, like `isomorphic-purify`, and waits. A 404 today is not a safe answer: package names are first come, first served, and anyone can publish that name tomorrow. Then the next developer who copies the same suggestion installs it without an error.",
        ]),
        h3("What a lockfile and a green install prove"),
        p("A lockfile (`package-lock.json`) records the exact version and an **integrity hash** of every package that was installed. That makes the next install reproducible: CI gets the same bytes you got. It does not say whether those bytes are the package you meant. A lockfile with the lookalike in it reproduces the lookalike faithfully. Likewise, `npm install` succeeding only proves the name exists, which is exactly what an attacker arranged."),
        callout("warning", "Install scripts run with your permissions",
            "preinstall, install and postinstall scripts run during npm install as the user who runs it: on a developer laptop that means access to SSH keys, cloud credentials and .env files; on a CI runner, access to the CI secrets. The lockfile marks such packages with \"hasInstallScript\": true. A new dependency with an install script deserves a look at what the script does."),
        h3("When not to make this heavy"),
        p("The goal is not to forbid new dependencies or to treat every young package as hostile. A new package from a team you know, an internal package from your own scope, or a fresh major version of a popular library are all normal. The check is a **filter for human attention**: it lists the suggestions that need a person to look, and lets the rest through. Also ask the cheaper question first: do you need a package at all? CodeDev already had `dompurify`; the assistant added two more sanitizers next to it."),

        challenge("chal_quiz_aad_411"),

        h2("4. Worked example: a dependency check in CI"),
        p("The fix for the incident had two parts: remove `dom-purify`, `isomorphic-purify` and `markdown-sanitize-lite` (the code only needed `marked` and `dompurify`), and add a check that runs before `npm install` on every pull request that changes `package.json`. The check needs a registry snapshot of the names in the diff. A small script builds it from two public endpoints:"),
        code("typescript", `
// scripts/registry-snapshot.ts - fetch what the dependency check needs, for the names in the diff
type RegistryPackage = { weeklyDownloads: number; versions: Record<string, string> };

async function snapshot(names: string[]): Promise<Record<string, RegistryPackage>> {
  const registry: Record<string, RegistryPackage> = {};
  for (const name of names) {
    // scoped names keep the @ and encode the slash: @types%2fnode
    const meta = await fetch(\`https://registry.npmjs.org/\${name.replace("/", "%2f")}\`);
    if (meta.status === 404) continue;                       // not found: leave it out
    if (!meta.ok) throw new Error(\`registry \${meta.status} for \${name}\`);
    const { time } = (await meta.json()) as { time: Record<string, string> };

    const dl = await fetch(\`https://api.npmjs.org/downloads/point/last-week/\${name}\`);
    const { downloads } = dl.ok ? ((await dl.json()) as { downloads: number }) : { downloads: 0 };

    const versions = Object.fromEntries(
      Object.entries(time)
        .filter(([key]) => key !== "created" && key !== "modified")
        .map(([version, iso]) => [version, iso.slice(0, 10)]),
    );
    registry[name] = { weeklyDownloads: downloads, versions };
  }
  return registry;
}`, "registry-snapshot.ts"),
        p("Keep the network part this thin and put the decisions in a pure function that takes the snapshot, a policy and today's date. Pure means testable with fixtures, which is exactly what the challenge below does. A failed registry call throws instead of reporting \"not found\": a check that silently passes when the registry is down is worse than no check."),
        p("The decisions, in the order the challenge uses them:"),
        numbered([
            "**Is the input valid?** A name with uppercase letters or spaces, or a range like `latest` or `4.x` that the policy does not accept, is reported, not looked up.",
            "**Does the name imitate a popular package?** Normalize both names (drop `@ / . _ ~ -`) and measure the edit distance. Popular names themselves are never flagged, otherwise `qs` and `ms` would flag each other. Short names allow less distance, or every three-letter package would look like another.",
            "**Does it exist?** Not found means the suggestion is wrong today and a target tomorrow.",
            "**Is it brand new and unused?** Young and barely downloaded is not proof of malice, but it is a reason to read the code and the install scripts before it runs anywhere.",
            "**Does the requested version exist?** `csv-stringify@^7.0.0` fails when 7 was never published. Assistants mix up major versions often, and an install that falls back to another version, or fails, is a bug either way.",
        ]),
        p("Order matters. A lookalike check that only runs on names that exist would report `@types-node` as merely \"not found\", and the reviewer would delete the line and move on, leaving a name that an attacker can register next week."),

        h2("5. How to verify a suggested dependency by hand"),
        bullets([
            "**Does it exist, and since when?** `npm view <name> time --json` (or `npm view <name> versions --json`). A 404 means nobody has published it.",
            "**Is it the package you think it is?** `npm view <name> repository.url homepage` and compare with the project's documentation. Search the docs of the library you wanted for the install command instead of trusting the one in the chat.",
            "**Who uses it?** `curl -s https://api.npmjs.org/downloads/point/last-week/<name>`. Compare with the package it resembles.",
            "**Does it run code on install?** `npm view <name> scripts`, and after an install, search the lockfile for `\"hasInstallScript\": true`. For a first look at an unknown package, `npm install --ignore-scripts` keeps install scripts from running.",
            "**Did the lockfile change the way you expect?** In the pull request, the `package-lock.json` diff should contain the packages you added and their dependencies, all resolved from your registry. Unexpected new packages deep in the tree are worth a question.",
            "**Python projects:** `https://pypi.org/pypi/<name>/json` returns the releases with upload times; a 404 means the project does not exist on PyPI.",
        ]),
        p("Then put the same checks in CI so that they do not depend on someone remembering them. The challenge is that check."),

        h2("6. Common mistakes, and how to spot them"),
        bullets([
            "**Deleting the 404 line and moving on.** Spot it: a pull request whose history has \"remove missing package\" with no note on why the assistant suggested it. Fix the prompt or the context too (give it the list of approved packages), and add the name to the check's blocklist.",
            "**Trusting the green install.** Spot it: approval comments that say \"CI passes\" on a pull request that changed `package.json`. Ask for the registry facts instead: age, downloads, install scripts.",
            "**Comparing versions as strings.** Spot it: a check that says `4.9.0` is newer than `4.10.0`. Split on dots and compare numbers.",
            "**Flagging every new package.** Spot it: a check that everybody ignores because it fails on every pull request. Thresholds belong in a policy object the team can tune, and popular packages are never lookalikes of each other.",
            "**Letting the assistant run `npm install` itself without review.** Spot it: agent sessions where the install happened before anyone read the diff. In agent settings, require approval for package installs, or run them in a sandbox without secrets.",
        ]),

        h2("7. Build the check"),
        p("Write `checkDependencies(suggested, registry, policy, today)` against a registry snapshot: report each suggestion as a lookalike, not found, new with low downloads, version not published, invalid or ok, in a stable order with the riskiest first. The tests replay the incident's pull request, the separator and scope tricks, the edges of the thresholds and a large snapshot."),
        challenge("chal_coding_aad_412"),

        h2("8. Summary"),
        bullets([
            "Assistants invent package names that look right; a 2025 study of 16 models found about 19.7% of suggested names did not exist, and attackers register the names that come back again and again (slopsquatting).",
            "A green install, `npm audit` and a lockfile prove that a name exists and stays the same, not that it is the package you meant. Check age, downloads, lookalike names and install scripts.",
            "Put the decisions in a pure, tested function fed by a registry snapshot, run it on every change to `package.json`, and use it to direct human attention, not to replace it.",
        ]),

        h2("Sources"),
        bullets([
            "Spracklen et al., \"We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs\", USENIX Security 2025",
            "npm Docs: npm view, package-lock.json, scripts (life cycle scripts) and npm install --ignore-scripts",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the package.json of a project you work on and run npm view <name> time --json and the downloads API for every direct dependency. Which one is the youngest? Which has an install script? Then ask your assistant to add a feature that needs a new library, and check its suggestion with the same commands before you install it."),
    ],
});
