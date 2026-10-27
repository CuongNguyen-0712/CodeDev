// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-1-1",
    title: "Supply chain risks: what can go wrong between npm install and production",
    slug: { _type: "slug", current: "supply-chain-risks-npm-install-to-production" },
    description:
        "A patch release of a transitive dependency, published from a hijacked maintainer account, ran its install script inside the CodeDev image build and read the CI secrets. Map every step from npm install to production where someone else's code or decision can enter: typosquatting, slopsquatting, dependency confusion, compromised maintainers, install scripts and compromised CI. Learn which control covers which step, and what SLSA levels and provenance do and do not promise.",
    estimatedTime: 20,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "SEC-187: the egress firewall of the CI runners flagged an outbound HTTPS request to an unknown host during the build of the content-tools image. The request came from the postinstall script of frontmatter-lite 3.2.5, a transitive dependency published six hours earlier from the account of a maintainer whose npm credentials had been phished. The Dockerfile ran npm install without the lockfile, so the build picked up the new patch release, and the job had the npm publish token and the deploy key in its environment. No dependency was added on purpose: the code arrived through a version range nobody had looked at for a year.",
    },

    content: [
        h2("1. The incident: nobody added anything"),
        p("The alert was short: a CI runner opened a connection to a host that appears in no allowlist, in the middle of the `content-tools` image build. The pull request that triggered the build changed a lesson title. No dependency was added, no `package.json` line changed, every review was green. Here is the first evidence the on-call engineer pulled:"),
        code("text", `
egress-proxy  2026-10-14T09:41:07Z  DENY  runner-ci-07  CONNECT telemetry-cdn-sync.example:443
                                     process: node /build/node_modules/frontmatter-lite/scripts/setup.js
                                     job: content-tools / docker build (run 18841)`, "egress log"),
        code("bash", `
# Dockerfile of the content-tools image (as it was)
FROM node:24-slim
WORKDIR /build
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build`, "Dockerfile"),
        code("text", `
#7 [3/5] RUN npm install
#7 4.812 > frontmatter-lite@3.2.5 postinstall
#7 4.812 > node scripts/setup.js
#7 9.104 added 418 packages, and audited 419 packages in 9s
#7 9.105 found 0 vulnerabilities`, "CI log, docker build"),
        p("Three facts explain the whole incident. The Dockerfile copies `package.json` but not `package-lock.json`, so `npm install` resolves every range again, at build time, against whatever the registry serves that minute. `frontmatter-lite` is not a dependency of ours: it sits three levels down, under a Markdown tool, behind a `^3.1.0` range that happily accepts `3.2.5`. And `3.2.5` was six hours old, published from a phished maintainer account, with a `postinstall` script that read the environment of the build. The job's environment held `NPM_TOKEN` and `DEPLOY_KEY`."),
        callout("info", "About the names in this lesson",
            "The packages, hosts, versions and dates in this course are fixtures made for the lessons. They show real attack patterns; they are not statements about packages on the public npm registry. Check real packages yourself with the commands in section 6."),

        h2("2. Read the evidence: where did 3.2.5 come from?"),
        p("Before you fix anything, find the path that brought the package in and the moment it changed. Two read-only commands answer that without installing anything:"),
        code("bash", `
$ npm ls frontmatter-lite --all
codedev-content-tools@1.0.0
\`-- lesson-md-pipeline@5.0.2
  \`-- md-meta-reader@2.1.0
    \`-- frontmatter-lite@3.2.5

$ npm view frontmatter-lite time --json
{
  "3.1.4": "2025-09-02T11:20:15Z",
  "3.2.0": "2025-11-18T08:03:44Z",
  "3.2.4": "2026-03-30T14:51:09Z",
  "3.2.5": "2026-10-14T03:37:52Z"
}

$ npm view frontmatter-lite@3.2.5 scripts
{ postinstall: 'node scripts/setup.js' }

$ npm view frontmatter-lite@3.2.4 scripts
{}`, "terminal"),
        p("Read it the way an investigator would. Seven months of silence, then a patch release at 03:37 UTC that adds an install script the previous version did not have. That pattern - a sudden release of a quiet package that adds a script or a new network call - is what a hijacked maintainer account usually looks like. Nothing about it is a vulnerability in the CVE sense, which is why `npm audit` said `found 0 vulnerabilities`: audit compares versions with published advisories, and on the morning of the incident there was no advisory yet."),
        p("The fix for this incident took four lines (copy the lockfile, run `npm ci`, run install scripts only where needed, move secrets out of the build). The more useful result of the postmortem was the question behind it: **where else can someone else's code or decision enter our build?**"),

        h2("3. The attack surface from npm install to production"),
        p("Follow one dependency from the moment someone types its name to the moment its code runs in production. Every arrow is a step where you trust someone:"),
        code("text", `
 name        ->  registry      ->  resolver        ->  install          ->  build / CI        ->  artifact  ->  production
 (who typed     (who owns the      (which version,     (what runs on       (which secrets,       (what was     (what runs
  it?)           name?)             from where?)        npm install?)       which actions?)       shipped?)     for users)`, "the path of a dependency"),
        p("Each class of attack below targets one of those steps. The rest of this course builds an automated check for each."),
        h3("Names: typosquatting and slopsquatting"),
        bullets([
            "**Typosquatting.** An attacker registers a name one edit away from a popular package (`expresss`, `dom-purify` for `dompurify`, `lodahs`) and waits for a typo in a terminal, a Dockerfile or a README. The package usually works - it often re-exports the real one - and adds an install script.",
            "**Slopsquatting.** AI coding assistants sometimes suggest package names that do not exist, and they tend to suggest the *same* invented names again for similar prompts. An attacker who collects those names can register them before you run `npm install`. Course E2 showed how to catch a name that returns 404; the harder case is the name that stopped returning 404 last week. Lessons 4 and 5 build the detectors.",
        ]),
        h3("Registries: dependency confusion"),
        p("A company uses unscoped internal package names such as `codedev-grading-utils` on a private registry. If a build can also reach the public registry, and someone publishes the same name there with a higher version, the resolver may pick the public one. The attack needs no typo and no compromised account: only a name that exists in two places and a resolver that is allowed to look in both. Scopes you own (`@codedev/...`) plus a registry mapping per scope close most of it (lesson 9)."),
        h3("Publishers: compromised maintainers"),
        p("The SEC-187 case. A real, trusted package gets a malicious release because the maintainer's npm token or password was stolen, the maintainer handed the package to a stranger, or the project's own release pipeline was compromised. Every check based on the *name* passes: it is the right package. Only checks on the *version* help: a lockfile that does not move without review, and a quarantine that refuses versions younger than a few days (lessons 2 and 3)."),
        h3("Install: lifecycle scripts"),
        p("npm runs `preinstall`, `install` and `postinstall` scripts of every package in the tree during `npm install` and `npm ci`, with the permissions of the user who runs it and the environment of that process. On a developer laptop that means SSH keys and cloud credentials; on a CI runner it means whatever secrets the job exposes. `npm ci --ignore-scripts` turns them off for the whole install; lesson 6 covers which packages genuinely need them."),
        h3("Build and CI: the pipeline itself"),
        bullets([
            "**Third-party actions referenced by a tag.** `uses: some-org/some-action@v3` runs whatever commit the tag points to today. Tags can be moved by whoever controls that repository.",
            "**Tokens with more rights than the job needs.** A workflow with `permissions: write-all`, or a long-lived publish token in every job, turns one malicious dependency into a malicious release of your own package.",
            "**Untrusted input in privileged jobs.** A pull request from a fork that can run code in a job with secrets. Lesson 9 limits token permissions.",
        ]),
        h3("Artifact and production: what was actually shipped"),
        p("Even with a clean build, can you say which dependencies are inside release `2026.10.3`, and prove that the image in production is the one CI built? That is what an SBOM (a list of components) and a signed digest are for (lessons 10 and 11)."),

        h2("4. What SLSA and provenance try to guarantee"),
        p("SLSA (Supply-chain Levels for Software Artifacts, slsa.dev) is a framework of incremental levels for how an artifact is built. Its Build track asks, roughly, as of SLSA v1.0:"),
        bullets([
            "**Build L1:** the build produces **provenance** - a document that says which source, which build process and which inputs produced the artifact.",
            "**Build L2:** the build runs on a hosted build platform that generates and signs the provenance itself, so it cannot simply be written by hand afterwards.",
            "**Build L3:** the build platform is hardened: builds are isolated from each other, and the signing material is not reachable from the user-defined build steps, so a malicious step cannot forge provenance.",
        ]),
        p("On npm, a package published with `npm publish --provenance` from a supported CI provider carries a signed statement that links the tarball to a source repository, a commit and a workflow. `npm audit signatures` verifies the registry signatures and those attestations for the packages you installed."),
        callout("warning", "Provenance answers \"where and how\", not \"is it safe\"",
            "A valid attestation proves that this tarball was built by that workflow from that commit of that repository. It does not say the commit was reviewed, that the maintainer was not phished, or that the code is harmless: an attacker who can push to the repository gets valid provenance for free. It also covers one package's build, not the builds of its dependencies. Treat provenance as evidence that narrows where to look, and check the current SLSA specification on slsa.dev before quoting level requirements: the framework is versioned and new tracks are being added."),
        p("When provenance helps a lot: a package whose tarball contains code that is not in its repository (a classic sign of a stolen publish token) fails the comparison, and a package that suddenly stops having provenance after years of having it deserves a look."),

        challenge("chal_quiz_ssc_111"),

        h2("5. Which control covers which step"),
        p("No single check covers the whole path. Write down, for your own pipeline, which control answers which attack, and where there is a gap. This is the map for the rest of the course:"),
        bullets([
            "**Typosquat / slopsquat (names):** an allowlist of approved names, a distance check against popular names, a registry lookup that rejects new or unknown names - lessons 3, 4 and 5.",
            "**Dependency confusion (registries):** owned scopes, one registry per scope, a lockfile whose `resolved` URLs only point at allowed registries - lessons 2 and 9.",
            "**Compromised maintainer (versions):** a lockfile that only changes in reviewed pull requests, `npm ci` everywhere, a quarantine for fresh versions - lessons 2 and 3.",
            "**Install scripts:** `--ignore-scripts` by default, an explicit list of packages allowed to run them, no secrets in install steps - lesson 6.",
            "**Secrets:** scanning diffs and logs, so a leaked token is caught before it is used - lessons 7 and 8.",
            "**CI:** actions pinned to commit SHAs, `permissions` per job, short-lived tokens - lesson 9.",
            "**What shipped:** SBOM diffs between releases, artifacts verified against signed digests - lessons 10 and 11.",
        ]),
        p("And for SEC-187 itself, the fixed Dockerfile:"),
        code("bash", `
FROM node:24-slim
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts          # exactly the reviewed lockfile, no install scripts
COPY . .
RUN npm run build                    # no NPM_TOKEN or DEPLOY_KEY in this stage`, "Dockerfile (fixed)"),
        callout("tip", "When not to over-engineer",
            "A weekend project with three dependencies does not need SLSA L3. Start with the cheap controls that stop the most common attacks: a committed lockfile, npm ci, no install scripts by default, no secrets in install steps. Add allowlists, quarantines and signatures when the project has users, secrets and a release pipeline worth attacking."),

        h2("6. How to verify each claim"),
        bullets([
            "**Which path brought a package in:** `npm ls <name> --all`.",
            "**When a version appeared:** `npm view <name> time --json`; a release after a long silence, at an odd hour, deserves a look.",
            "**Whether a version runs code on install:** `npm view <name>@<version> scripts`, compared with the previous version.",
            "**Whether the build uses the lockfile:** search Dockerfiles and workflows for `npm install` (should be `npm ci`) and check that `package-lock.json` is copied before it runs.",
            "**What secrets a step can read:** list the variable names (never the values) in the job, for example `env | cut -d= -f1 | sort`, and compare with what that step needs.",
            "**Signatures and provenance:** `npm audit signatures` after `npm ci`; it reports packages with verified registry signatures and verified attestations.",
        ]),

        h2("7. Common mistakes, and how to spot them"),
        bullets([
            "**\"`npm audit` is our supply chain check.\"** It finds known vulnerabilities in versions that already have an advisory. A malicious release published this morning has none. Spot it: your pipeline has `npm audit` and nothing else between the registry and the build.",
            "**\"We have a lockfile, so builds are reproducible.\"** Only where it is used. A Dockerfile that copies `package.json` alone, or a job that runs `npm install`, resolves ranges again. Spot it: grep build files for `npm install` and for `COPY package.json` without the lockfile.",
            "**\"Pinning our direct dependencies pins everything.\"** An exact version in `package.json` says nothing about the ranges inside that package. SEC-187 came in three levels down. Spot it: `npm ls --all` shows hundreds of packages for a dozen direct ones.",
            "**\"Dev dependencies do not matter, they are not shipped.\"** They run on every developer laptop and every CI runner, which is where the secrets are. Spot it: the job that runs tests also has the deploy key.",
            "**\"It has provenance, so it is safe.\"** Provenance proves origin, not intent. Spot it: a review comment that approves a new dependency because of a badge.",
        ]),

        h2("8. Summary"),
        bullets([
            "Someone else's code enters at every step: the name you type, the registry that answers, the version the resolver picks, the scripts that run on install, the actions and tokens of CI, and the artifact you ship.",
            "Each attack class has a matching control - names: allowlists and lookalike checks; versions: lockfile, npm ci and quarantine; install: no scripts by default; CI: pinned actions and minimal tokens; shipping: SBOMs and signed digests.",
            "SLSA levels and npm provenance tell you where and how an artifact was built; they make tampering after the build harder, but they do not tell you the code is good.",
        ]),

        h2("Sources"),
        bullets([
            "SLSA specification, Build track levels - slsa.dev",
            "npm documentation: package-lock.json, npm ci, npm audit signatures, scripts (lifecycle scripts) - docs.npmjs.com",
            "GitHub documentation: security hardening for GitHub Actions (pinning actions to a full-length commit SHA, GITHUB_TOKEN permissions)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Draw the path of section 3 for one real project you work on. For each arrow, write the control you have today, or \"none\". Then run npm ls --all | wc -l and npm query \":attr(scripts, [postinstall])\" (npm 8.16 or later) to see how many packages you install and how many of them run a postinstall script."),
    ],
});
