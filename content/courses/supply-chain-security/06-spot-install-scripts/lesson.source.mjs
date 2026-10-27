// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-2-3",
    title: "Spot the AI mistake: install scripts allowed by default",
    slug: { _type: "slug", current: "spot-ai-mistake-install-scripts-allowed-by-default" },
    description:
        "Why did the postinstall script of @codedev-ui/form-utils run in CI at all, when CodeDev had blocked install scripts for a year? Two weeks earlier an AI assistant was asked to make the install step faster and stop a native module build failing, and it allowed every package's scripts. Learn what preinstall, install, postinstall and prepare do, which packages really need them, how to block them by default and allow only reviewed versions pinned by integrity, and how to review an AI change that fixes a red build by widening permissions.",
    estimatedTime: 30,

    scenario: {
        role: "DevOps engineer and code reviewer, CodeDev learning platform",
        problem:
            "The incident review of PR #1184 (lesson 2.1) has one open question: the CI install job of the CodeDev web app was supposed to run npm ci --ignore-scripts, so the postinstall script of @codedev-ui/form-utils should never have run on runner ci-07. git blame on .github/workflows/ci.yml points to a change merged two weeks earlier, written with an AI assistant to fix a failing native module build. The build has been green since.",
    },

    content: [
        h2("1. The incident: a green build that opened the door"),
        p("For a year CodeDev's install job ran in two steps: install everything without lifecycle scripts, then run the scripts of the few packages someone had reviewed. When sharp, an image library with native code, was added for course covers, the build failed: sharp was not on the reviewed list, so its install step never ran. The developer asked an assistant for help, in these words:"),
        code("text", `
You: make the CI install step faster and stop the native module build failing

Assistant: The failure happens because --ignore-scripts prevents native modules like sharp
from building. Running everything in one step is also faster. Changes:
  1. ci.yml: replace the two install steps with one npm ci that runs scripts
  2. planInstallScripts: allow install scripts by default, so new native modules
     work without manual steps`, "chat with the coding assistant"),
        code("text", `
 - name: Install
-  run: npm ci --ignore-scripts
-- name: Build reviewed native modules
-  run: npm rebuild $(node scripts/plan-install-scripts.mjs --names)
+  run: npm ci --foreground-scripts --unsafe-perm`, ".github/workflows/ci.yml, the assistant's diff"),
        code("typescript", `
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

// Packages on the allowlist are known to need their scripts. Native modules that are not on it yet
// (like sharp last week) broke the build, so every package may run its install scripts by default.
const ALLOW_SCRIPTS_BY_DEFAULT = true;

function planInstallScripts(lock: LockedPackage[], allowlist: AllowEntry[]): Plan {
    const reviewed = new Set(allowlist.map((entry) => entry.name));
    const plan: Plan = { run: [], blocked: [] };
    for (const pkg of lock) {
        for (const script of INSTALL_SCRIPTS) {
            if (!pkg.scripts[script]) continue;
            const id = \`\${pkg.name}@\${pkg.version}\`;
            if (reviewed.has(pkg.name) || ALLOW_SCRIPTS_BY_DEFAULT) plan.run.push({ package: id, script });
            else plan.blocked.push({ package: id, script, reason: "not_allowlisted" });
        }
    }
    return plan;
}`, "scripts/plan-install-scripts.ts, as merged"),
        p("The reviewer saw a red build turn green, read a function with an allowlist and a `blocked` list in it, and approved. The tests passed too: they all used packages that were on the allowlist. Two weeks later that same job ran the postinstall script of a package that had existed for 57 minutes."),

        h2("2. Read the change as an attacker would"),
        p("The request had two parts, and the assistant answered both literally. \"Faster\" became one step instead of two. \"Stop the build failing\" became: let everything run. Read the code for what it allows, not for what its names suggest:"),
        bullets([
            "`ALLOW_SCRIPTS_BY_DEFAULT = true` makes the condition `reviewed.has(...) || true`: always true. The `blocked` branch is dead code. The function still *looks* like a policy, which is why it passed review.",
            "`reviewed` holds names only. Even with the constant set to `false`, a reviewed name would run the scripts of any version, including one published tomorrow from a stolen maintainer account.",
            "`INSTALL_SCRIPTS` has no `prepare`. npm runs `prepare` when it installs a dependency from git, so a git dependency would run code that this plan never even mentions.",
            "`--unsafe-perm` is a flag from npm 6 and earlier, where it kept scripts running as root instead of switching to an unprivileged user. Current npm releases no longer document it. Its presence in a diff is a sign the change was copied from an old answer about making scripts run *more*, not less.",
        ]),
        p("You can see the effect in the CI log of any run since the merge. Before the change the install log never showed a dependency's script; after it, every one of them ran with the job's environment:"),
        code("text", `
npm info run esbuild@0.25.9 postinstall node_modules/esbuild node install.js
npm info run sharp@0.34.4 install node_modules/sharp node install/check.js
npm info run bcrypt@5.1.1 install node_modules/bcrypt node-pre-gyp install --fallback-to-build
npm info run @codedev-ui/form-utils@1.2.1 postinstall node_modules/@codedev-ui/form-utils node ./scripts/setup.js`, "CI log, install job of PR #1184 (npm ci --foreground-scripts, verbose)"),

        h2("3. Core idea: install scripts are code you run without reading"),
        h3("What runs, and when"),
        p("A package can declare lifecycle scripts in its `package.json`. During `npm install` or `npm ci`, npm runs these for **every** package in the tree, with your user, your working directory and every environment variable of the shell or CI job:"),
        bullets([
            "**preinstall, install, postinstall** run for registry packages when they are installed. If a package has a `binding.gyp` file and no install or preinstall script of its own, npm runs `node-gyp rebuild` as its install script.",
            "**prepare** of a registry package does **not** run when you install it; it runs before its author packs or publishes it. But when a dependency comes from git, npm clones it, installs its dependencies and runs its `prepare` to build it. A git dependency is code built on your machine from a commit nobody published.",
            "`package-lock.json` marks each package that has install scripts with `\"hasInstallScript\": true`. That is your inventory.",
        ]),
        h3("Who really needs them"),
        p("Very few packages. The legitimate uses are building native code (bcrypt through node-pre-gyp, sharp when no prebuilt binary fits the platform) and fetching or checking a platform binary (esbuild's postinstall). Many popular native packages now ship prebuilt binaries as optional platform packages, such as `@img/sharp-linux-x64` or `@esbuild/linux-x64`, which have no scripts at all. A typical web app has a handful of packages with install scripts in a tree of a thousand."),
        p("So the policy writes itself: **block every install script by default, allow the few you reviewed, and pin each approval to what you reviewed**: the name, the exact version and the integrity hash from the lockfile. A new version is new code; it needs a new look, usually a two-minute diff of its scripts. A git dependency has no registry integrity to pin, so its scripts stay blocked; if you depend on it, publish it to your own registry scope, where it gets a version and an integrity like everything else."),
        callout("info", "When not to write this yourself",
            "Some package managers already block dependency scripts by default. pnpm 10 does not run dependency build scripts unless the package is listed in onlyBuiltDependencies (check the settings documentation for your version), and Bun runs them only for packages in trustedDependencies plus a built-in list of popular packages. If you use one of those, configure it instead of writing a planner, and add the version and integrity pinning on top only if its list is name-based. The planner in this lesson is for npm, whose default is to run everything."),
        h3("Why the build failed in the first place"),
        p("The original failure was the policy working: a new package with an install script was blocked until someone reviewed it. The right response to that red build was a small review (read sharp's install script, add sharp 0.34.4 with its integrity to the allowlist) and a clearer error message in CI, so the next developer knows what to do. The assistant optimised for the symptom and widened permissions for every package, forever."),

        challenge("chal_quiz_ssc_231"),

        h2("4. Worked example: the install job, done right"),
        p("Three pieces: the install never runs scripts, a planner decides which reviewed packages may run theirs, and the job prints everything it blocked so nobody has to guess."),
        code("yaml", `
# .github/workflows/ci.yml (excerpt)
- name: Install without lifecycle scripts
  run: npm ci --ignore-scripts
- name: Plan install scripts (reviewed name + version + integrity only)
  run: node scripts/plan-install-scripts.mjs package-lock.json config/install-scripts.json > plan.json
- name: Report blocked scripts
  run: jq -r '.blocked[] | "blocked: \\(.package) \\(.script) (\\(.reason))"' plan.json
- name: Build reviewed native modules
  run: npm rebuild $(jq -r '[.run[].package | sub("@[^@]+$"; "")] | unique | join(" ")' plan.json)`, ".github/workflows/ci.yml"),
        code("json", `
[
  { "name": "bcrypt",  "version": "5.1.1",  "integrity": "sha512-...", "reviewedBy": "reviewer-a" },
  { "name": "sharp",   "version": "0.34.4", "integrity": "sha512-...", "reviewedBy": "reviewer-b" },
  { "name": "esbuild", "version": "0.25.9", "integrity": "sha512-...", "reviewedBy": "reviewer-a" }
]`, "config/install-scripts.json, changed only through a reviewed PR (CODEOWNERS)"),
        p("Close the gap on laptops too: in lesson 2.1 the malicious script ran on the developer's machine before it ran in CI. A project `.npmrc` with `ignore-scripts=true` makes every `npm install` in the repository skip dependency scripts. Commands that explicitly run one of your own scripts, such as `npm test` or `npm run build`, still work; their pre and post scripts do not run. Developers then run the same `npm rebuild` step locally after installing."),
        code("text", `
# .npmrc (repository root)
ignore-scripts=true`, ".npmrc"),

        h2("5. Reviewing AI changes to the pipeline"),
        p("Assistants are good at turning a red build green. Before approving a change that does that, ask what it **allowed** that was not allowed before:"),
        numbered([
            "**Look for widened defaults.** A constant like `ALLOW_..._BY_DEFAULT = true`, a `|| true`, a `catch {}` that swallows a failure, a check moved behind a flag. Any of them can make a whole branch of a policy dead code.",
            "**Look for new flags on install and run commands.** `--unsafe-perm`, `--foreground-scripts` without `--ignore-scripts`, `--legacy-peer-deps`, `--force`, `--no-audit`. Ask what each one turns off.",
            "**Check what an approval is pinned to.** A name is not a review; a version and an integrity hash are.",
            "**Ask for the test that should fail.** For this change: a lockfile with a new package that has a postinstall script must produce a blocked entry. If the PR only has tests with allowlisted packages, it has not tested the policy at all.",
            "**Fix the cause, not the permission.** If a check blocked something legitimate, the fix is usually a reviewed entry and a better error message, not a weaker check.",
        ]),
        p("You will review the assistant's planner yourself. The public tests pass on its code, exactly like the PR's tests did: every package with scripts in them is on the allowlist. The hidden tests add what production will eventually see: a new package with a postinstall script, an allowlisted name at another version or with another integrity, and git dependencies with prepare scripts."),
        challenge("chal_coding_ssc_232"),

        h2("6. How to verify the fix"),
        bullets([
            "**A canary package.** Keep a tiny internal package whose postinstall writes a file, add it to a test fixture project, run the CI install steps on it, and assert that the file does not exist. That tests the pipeline, not just the planner.",
            "**Planner tests that fail on the assistant's code:** a new package with a postinstall (blocked, not allowlisted), a bumped version of an allowlisted package (version mismatch), the same version with a different integrity (integrity mismatch), a git dependency with prepare (git dependency).",
            "**An inventory you can compare.** List every package with install scripts and compare it with the allowlist on every PR; a new entry in the list is a review item.",
        ]),
        code("bash", `
# every package in the tree with install scripts, from the lockfile
jq -r '.packages | to_entries[] | select(.value.hasInstallScript) | "\\(.key) \\(.value.version)"' package-lock.json
# the same question asked of the installed tree (npm 8.16 and later)
npm query ":attr(scripts, [postinstall])" | jq -r '.[] | "\\(.name)@\\(.version)"'`, "terminal"),

        h2("7. Common mistakes"),
        bullets([
            "**Allowing scripts by default to fix a native build.** Spot it: a default or a flag that makes a policy's blocked branch unreachable; a blocked list that is always empty in CI logs.",
            "**Allowlisting names instead of reviewed versions.** Spot it: allowlist entries without a version and integrity, or a check that compares only `name`.",
            "**Forgetting git dependencies.** npm builds them with `prepare` on your machine. Spot it: `git+` or `github:` in `resolved` in the lockfile, and a planner that only knows the three install scripts.",
            "**Ignoring scripts in CI but not on laptops.** Spot it: no `ignore-scripts=true` in the project `.npmrc`, so the first machine to install a malicious version is a developer's.",
            "**Testing the policy only with approved packages.** Spot it: no test fixture with an unreviewed package that has an install script.",
        ]),

        h2("8. Summary"),
        numbered([
            "preinstall, install and postinstall of every dependency, and prepare of every git dependency, run with your user and your CI secrets. Very few packages need them.",
            "Block by default, run only reviewed scripts pinned to name, exact version and integrity, keep git dependencies blocked, and report everything you block. Use your package manager's built-in policy when it has one.",
            "When an AI change turns a red build green, ask what it allowed: widened defaults, new install flags and name-only trust are the usual suspects, and the hidden tests are the ones with packages nobody reviewed.",
        ]),

        h2("Sources"),
        bullets([
            "npm Docs: scripts (life cycle scripts, prepare and git dependencies, node-gyp default) - docs.npmjs.com/cli/v10/using-npm/scripts",
            "npm Docs: config, ignore-scripts; npm rebuild; npm query - docs.npmjs.com/cli/v10/using-npm/config",
            "pnpm Docs: settings, onlyBuiltDependencies - pnpm.io/settings",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run the jq inventory on one of your own projects and write down every package with install scripts: what the script does (read it in node_modules), whether a prebuilt binary or a platform package would make it unnecessary, and whether you would approve this exact version. Then try npm ci --ignore-scripts on the project and note what breaks: that list, and nothing more, is your allowlist."),
    ],
});
