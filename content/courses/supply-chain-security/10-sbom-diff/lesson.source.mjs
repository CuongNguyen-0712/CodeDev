// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-4-1",
    title: "SBOMs: what changed between two releases",
    slug: { _type: "slug", current: "sbom-diff-what-changed-between-releases" },
    description:
        "Release 2026.10.3 of the CodeDev API started calling a host nobody recognised. The pull request changed one line in package.json; the lockfile diff was 900 lines nobody read. Learn what a CycloneDX SBOM records (components, purls, versions, licenses, hashes, nested components), why the useful unit of review is the diff between two releases, how to key components by purl without version, compare versions by semver precedence, and flag the finding that matters most: the same version with different bytes.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "Two days after release 2026.10.3 of the API at https://api.codedev.test, the egress proxy logs show POST requests from the API pods to telemetry.metrics-cdn.test, a host no CodeDev service is configured to call. The release pull request changed a single line of package.json (chart-kit ^1.4.2 to ^2.0.0, for the progress charts on the instructor dashboard) and was approved in four minutes. The lockfile diff in the same pull request was 900 lines long and collapsed by the review tool. CI already generates a CycloneDX SBOM for every release and stores it next to the image; nobody had ever compared two of them.",
    },

    content: [
        h2("1. The incident: one line in package.json, 900 in the lockfile"),
        p("This is everything the reviewer saw in the pull request:"),
        code("text", `
 package.json
-    "chart-kit": "^1.4.2",
+    "chart-kit": "^2.0.0",

 package-lock.json
 (Large diff not rendered by default: 912 lines changed)`, "PR #1874, files changed"),
        p("And this is what the egress proxy logged after the release went out:"),
        code("text", `
2026-10-22T09:14:03Z api-7c9f6d5b8-q2kxl  POST https://telemetry.metrics-cdn.test/v1/collect  200  1.8 KB
2026-10-22T09:14:03Z api-7c9f6d5b8-zt4wm  POST https://telemetry.metrics-cdn.test/v1/collect  200  1.8 KB
2026-10-22T09:19:03Z api-7c9f6d5b8-q2kxl  POST https://telemetry.metrics-cdn.test/v1/collect  200  1.7 KB`, "egress-proxy.log"),
        p("Nobody on the team wrote code that calls that host. Something in the dependency tree does, and it arrived with this release. The reviewer approved what they could see; what they could not see was the change in the **installed tree**: new transitive packages, a changed license, a package whose bytes changed. A one-line change in `package.json` can change dozens of installed packages, because every range is resolved again."),

        h2("2. Read the evidence: two SBOMs, one question"),
        p("CI already writes a **Software Bill of Materials** for each release: an inventory of the components inside the artifact. CodeDev uses CycloneDX JSON. Recent npm versions can write one from the lockfile and the installed tree (`npm sbom`); the CycloneDX project also maintains a generator for npm. Check the options of the version you run; the commands below are typical:"),
        code("bash", `
# from the project directory, after npm ci (production dependencies only)
npm sbom --sbom-format cyclonedx --omit dev > sbom-2026.10.3.cdx.json

# or the CycloneDX generator
npx @cyclonedx/cyclonedx-npm --omit dev --output-file sbom-2026.10.3.cdx.json`, "terminal"),
        p("One component in that file looks like this (trimmed to the fields this lesson uses):"),
        code("json", `
{
  "type": "library",
  "group": "@codedev",
  "name": "ui",
  "version": "2.1.0",
  "purl": "pkg:npm/%40codedev/ui@2.1.0",
  "licenses": [{ "license": { "id": "MIT" } }],
  "hashes": [{ "alg": "SHA-512", "content": "9f86d0...0f00a0" }],
  "components": []
}`, "sbom-2026.10.3.cdx.json (one component)"),
        p("The file for the API has about 1,800 components. Nobody reviews 1,800 components, and nobody should: the previous release was already reviewed and shipped. The question for this release is **what changed**. With `jq` you can get a first rough answer in a minute:"),
        code("bash", `
jq -r '.. | objects | select(has("purl")) | .purl' sbom-2026.10.2.cdx.json | sort -u > before.txt
jq -r '.. | objects | select(has("purl")) | .purl' sbom-2026.10.3.cdx.json | sort -u > after.txt
diff before.txt after.txt`, "terminal"),
        code("text", `
< pkg:npm/chart-kit@1.4.2
> pkg:npm/chart-kit@2.0.0
> pkg:npm/postinstall-helper@0.0.3
> pkg:npm/metrics-relay@1.0.1
< pkg:npm/lodash@4.17.20
> pkg:npm/lodash@4.17.21`, "diff output (excerpt)"),
        p("Already better than the collapsed lockfile: two packages appeared that nobody asked for, and `metrics-relay` is a good candidate for the unknown host. But this rough diff has three problems you will fix in this lesson. An upgrade shows up as one removal plus one addition. It sees only purls, so it misses a license change from MIT to a source-available license in `chart-kit` 2.0.0. And it is blind to the most dangerous change of all: **a package whose version stayed the same and whose bytes did not**."),

        h2("3. Core idea: diff the inventory, keyed by identity"),
        h3("What a purl is"),
        p("A **package URL** (purl) names a package in a way that works across ecosystems: `pkg:<type>/<namespace>/<name>@<version>?<qualifiers>#<subpath>`. For npm, the type is `npm` and the namespace is the scope. The `@` of a scope is percent-encoded as `%40` by many generators, so the same package can appear as `pkg:npm/%40codedev/ui@2.1.0` in one SBOM and `pkg:npm/@codedev/ui@2.1.0` in another. Qualifiers (`?vcs_url=...`, `?arch=x64`) and subpath (`#dist`) add details that do not change which package it is."),
        h3("Key by identity, not by identity plus version"),
        p("If the diff keys components by the whole purl, every upgrade becomes noise: `lodash@4.17.20` removed, `lodash@4.17.21` added. A release with 40 patch upgrades produces 80 lines, and the one genuinely new package hides among them. Key instead by **the purl without version, qualifiers and subpath**, with `%40` decoded. Then an upgrade is one line with a direction, and an addition really means \"a package we never shipped before\"."),
        bullets([
            "**Components without a purl.** Internal tools, vendored code or generator gaps can produce components with only a name. Fall back to a key built from `group` and `name`, and prefix it (for example `name:`) so it can never collide with a purl. Count them: a growing number of components without purl means your SBOM is getting less precise.",
            "**Nested components.** CycloneDX lets a component contain `components`. Some generators nest bundled or vendored packages this way. A diff that reads only the top-level array misses everything inside.",
            "**The same package twice.** npm can install two versions of one package when two dependents need incompatible ranges (`debug@2.6.9` and `debug@4.3.7`). Those are two entries with the same key. Some generators also list the very same key and version twice; that is one component written twice, not two.",
        ]),
        h3("Versions compare by semver, not as strings"),
        p("For strings, `\"1.10.0\" < \"1.9.0\"` is true, because the comparison stops at the first different character and `1` sorts before `9`. Semantic Versioning compares MAJOR, MINOR and PATCH as numbers, then puts a prerelease below its release (`6.0.0-rc.1` < `6.0.0`) and compares prerelease identifiers one by one (numeric ones as numbers, so `alpha.10` > `alpha.9`). Build metadata (`+build.7`) does not count. Not every version string is semver (`1.0`, a git hash): say \"unknown\" rather than guess."),
        p("Direction is a signal, not just a label. An **upgrade within the same major** is the common, low-risk case. A **major upgrade** may change behaviour and licenses, as chart-kit 2.0.0 did. A **downgrade** is unusual in a release that nobody meant to roll back: it can be a resolution conflict, an old pin copied from somewhere, or an attacker preferring a version with a known vulnerability."),
        h3("Same version, different bytes"),
        p("This is the finding to page someone for. On the public npm registry a published `name@version` cannot be replaced: even after an unpublish, the version number cannot be reused. So if an SBOM entry has the **same key and version but a different hash** for the same algorithm, the bytes came from somewhere else: a mirror or proxy that served a different tarball, an internal registry that shadowed the public name (dependency confusion, lesson 3.3), a cache someone wrote to, or a rebuilt internal package. Compare only algorithms present on both sides: SHA-512 in one SBOM and SHA-256 in the other tell you nothing about each other."),
        callout("info", "When an SBOM diff is not the right tool",
            "An SBOM is an inventory, not a verdict. It does not tell you whether a package is malicious or vulnerable (that is a scanner's job, fed with the same SBOM), and it only lists what the generator could see: code copied into your repository, binaries downloaded by a postinstall script or tools installed with curl in the Dockerfile are invisible to it. An SBOM is also just a file: if the job that builds the image can be tampered with, so can its SBOM. Lesson 4.2 covers how to make artifacts and their metadata verifiable."),
        challenge("chal_quiz_ssc_411"),

        h2("4. Worked example: the diff for release 2026.10.3"),
        p("Run the keyed diff over the two SBOMs of the incident and the output is short enough to read in a minute. This is the format the challenge produces, cut to the interesting lines:"),
        code("json", `
{
  "added": [
    { "key": "pkg:npm/metrics-relay", "version": "1.0.1" },
    { "key": "pkg:npm/postinstall-helper", "version": "0.0.3" }
  ],
  "removed": [],
  "versionChanged": [
    { "key": "pkg:npm/chart-kit", "from": "1.4.2", "to": "2.0.0", "direction": "upgrade", "sameMajor": false },
    { "key": "pkg:npm/lodash", "from": "4.17.20", "to": "4.17.21", "direction": "upgrade", "sameMajor": true }
  ],
  "licenseChanged": [
    { "key": "pkg:npm/chart-kit", "version": "2.0.0", "from": ["MIT"], "to": ["BUSL-1.1"] }
  ],
  "hashChanged": [
    { "key": "pkg:npm/event-stream", "version": "3.3.6", "algs": ["SHA-512"] }
  ],
  "summary": { "before": 1794, "after": 1796, "added": 2, "removed": 0, "versionChanged": 2,
               "licenseChanged": 1, "hashChanged": 1, "duplicatesCollapsed": 3, "withoutPurl": 4 }
}`, "sbom-diff 2026.10.2 -> 2026.10.3"),
        p("Read it top to bottom, as the reviewer should have:"),
        numbered([
            "**Two additions nobody asked for.** `npm explain metrics-relay` shows who pulled it in: `chart-kit@2.0.0`. Its source posts usage data to `telemetry.metrics-cdn.test`: there is the unknown host.",
            "**A major upgrade with a license change.** chart-kit 2.0.0 moved from MIT to a source-available license. That alone needs a decision by someone who owns licensing, before the code ships.",
            "**A hash change without a version change.** `event-stream@3.3.6` has different bytes than in the last release. The lockfile diff shows its `resolved` URL now points at a mirror. Until someone compares the two tarballs, this is the most serious line in the report.",
        ]),
        p("The fix for the incident is ordinary: pin chart-kit back to `1.4.2`, open an issue to evaluate 2.x, point `event-stream` back at the registry the lockfile used before and find out why the mirror served different bytes. The lasting fix is the CI step that would have shown this diff on the pull request:"),
        code("yaml", `
# .github/workflows/release.yml (excerpt)
  sbom-diff:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with: { name: sbom }                      # sbom.cdx.json of this build
      - name: Fetch the SBOM of the last release
        run: curl -fsSL "$RELEASES_URL/latest/sbom.cdx.json" -o previous.cdx.json
      - name: Diff and apply the policy
        run: node scripts/sbom-diff.mjs previous.cdx.json sbom.cdx.json --report sbom-diff.json
      # policy in scripts/sbom-diff.mjs:
      #   hashChanged          -> fail
      #   licenseChanged       -> fail unless the new license is on the allowlist
      #   downgrade            -> fail unless the PR has the label "intended-downgrade"
      #   added                -> list in the PR comment for review`, "release.yml"),

        h2("5. How to verify the diff itself"),
        p("A diff tool that reports noise gets ignored, and one that misses changes is worse than none. Check yours like any other code:"),
        bullets([
            "**Same input, empty diff.** Generate the SBOM twice from the same commit and lockfile and diff the two: every list must be empty. If not, your generator or your keying is unstable (timestamps, order, serial numbers).",
            "**One planted change, one line.** Bump a single patch version on a branch, generate both SBOMs and check that the diff has exactly one `versionChanged` entry and nothing else.",
            "**Fixture files for the hard cases.** Keep small SBOMs in the repository for `%40` against `@`, qualifiers, nested components, a package installed in two versions, a component without purl and `1.9.0` to `1.10.0`. They are the test cases of your diff script.",
            "**Cross-check the counts.** `summary.after` should be close to the number of packages `npm ls --all --omit dev --parseable | wc -l` reports for the same lockfile; a big gap means the generator missed part of the tree.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Keying by the full purl.** Every upgrade becomes an addition and a removal, and real additions drown. Spot it: the diff of a routine dependency bump lists twice as many lines as packages that changed.",
            "**Comparing versions as strings.** `1.10.0` looks older than `1.9.0`, and `1.0.0` looks older than `1.0.0-rc.1`. Spot it: a fixture with `1.9.0 -> 1.10.0` reported as a downgrade.",
            "**Reading only the top-level components.** Bundled and vendored packages nested inside another component never show up. Spot it: `jq '[.. | objects | select(has(\"purl\"))] | length'` counts more components than your diff's summary.",
            "**Dropping hash changes as generator noise.** The same version with different bytes is exactly what a tampered mirror or a dependency confusion attack looks like. Spot it: your report has no section for it, or it only compares hashes when the version changed.",
            "**Generating the SBOM from package.json.** It lists ranges, not what was installed. Spot it: versions like `^2.0.0` in the SBOM, or the SBOM does not change when only the lockfile changes.",
        ]),
        p("In the challenge you write the diff the release job runs: keys from purls (with the fallback for components without one), nested components, duplicates, semver direction, license and hash changes, a sorted report and a summary. The tests run it on small SBOMs like the one above, on prereleases and build metadata, on a package installed in two versions, on a large SBOM and on invalid input."),
        challenge("chal_coding_ssc_412"),

        h2("7. Summary"),
        numbered([
            "An SBOM is the inventory of what a release ships; the reviewable unit is the diff between two releases, generated from the lockfile and the installed tree, not from package.json.",
            "Key components by purl without version, qualifiers and subpath (with a stated fallback when there is no purl), walk nested components, and compare versions by semver precedence so upgrades, downgrades and major changes are labelled correctly.",
            "Treat a hash change without a version change as an incident until proven otherwise, and make CI fail on it, on unapproved license changes and on unintended downgrades.",
        ]),

        h2("Sources"),
        bullets([
            "CycloneDX specification overview - cyclonedx.org/specification/overview/",
            "Package URL (purl) specification - github.com/package-url/purl-spec",
            "Semantic Versioning 2.0.0, precedence rules (section 11) - semver.org",
            "npm documentation: package-lock.json - docs.npmjs.com/cli/v10/configuring-npm/package-lock-json",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Generate the SBOM of a project you work on for its last two tagged releases (check out each tag, run npm ci, then your generator), and diff them with jq or your own script. Write down every added package and who pulls it in (npm explain <name>), every license that changed, and whether any version kept its number but changed its hash. Then decide which of those findings should fail CI and write that policy down next to the pipeline."),
    ],
});
