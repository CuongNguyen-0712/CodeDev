// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-2-2",
    title: "Typosquatting & slopsquatting: names one edit away",
    slug: { _type: "slug", current: "typosquatting-slopsquatting-names-one-edit-away" },
    description:
        "After the @codedev-ui incident, a review of a month of approvals found crossenv and reqeust in CodeDev's lockfile, both approved by people who read them as cross-env and request. Learn how typosquats and slopsquats are built, why plain string comparison and plain Levenshtein miss them, how to normalize names the way a hurried reader sees them, why short names need a stricter threshold, and where a distance check stops helping. Then build the detector.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "After the incident with @codedev-ui/form-utils (lesson 2.1), the security lead asks for every dependency approved in the last month to be checked again. Two approvals stand out in the allowlist log of the CodeDev web app: crossenv, approved as \"cross-env, standard\", and reqeust, approved as \"request, used in the seed script\". Both were added by AI-assisted PRs, both passed review, and neither is the package the reviewer thought it was.",
    },

    content: [
        h2("1. The incident: names that read as familiar"),
        p("Lesson 1.3 added an allowlist: a new dependency cannot be installed until someone approves it. That works only if the person approving can tell what they are looking at. Here is the approval log for October:"),
        code("text", `
date        action    package            by           note
2026-10-02  approve   crossenv@7.0.3     reviewer-a   "cross-env, standard"
2026-10-05  approve   react-dom@19.1.1   reviewer-b
2026-10-07  approve   reqeust@2.88.2     reviewer-b   "request, used in the seed script"
2026-10-09  approve   zod@4.1.5          reviewer-a`, "allowlist approvals, CodeDev web app"),
        p("Both reviewers wrote the name of a different package in their note. They did not misread carelessly: people read words by their shape, and `crossenv` and `reqeust` have the shape of `cross-env` and `request`. The registry, on the other hand, compares exact strings. To the registry `crossenv` is a separate package, owned by whoever registered it."),
        code("bash", `
$ npm view crossenv time.created maintainers dist-tags.latest
time.created = '2026-09-18T22:04:51.118Z'
maintainers = [ 'build-tools-x <...>' ]
dist-tags.latest = '7.0.3'
$ npm view cross-env time.created
time.created = '...'           # years of history, millions of weekly downloads`, "terminal, during the review"),
        p("The name `crossenv` has a history: in 2017 a package by that name was one of several typosquats removed from npm after it was found sending the environment variables of every machine that installed it to its author. Attackers reuse names that worked before."),

        h2("2. Four ways to look like a popular package"),
        bullets([
            "**Typosquatting:** the name a human gets wrong when typing. A swapped pair (`reqeust`, `chlak`), a missing or doubled letter (`dompurfy`, `expresss`), a dropped separator (`crossenv`).",
            "**Character tricks:** `1` for `l`, `0` for `o` (`l0dash`), `_` or `.` for `-` (`cross_env`, `date.fns`), a familiar suffix or prefix (`chalk-js`, `js-chalk`), or a popular name inside a scope nobody reviewed (`@evil/chalk`).",
            "**Slopsquatting:** the name an AI assistant invents. Assistants repeat the same plausible names across many users, so a name that returns 404 today is worth registering for an attacker. Some are close to a real package (`reqeust` in generated code), many are not (`@codedev-ui/form-utils`, `express-session-redis-store`).",
            "**Combosquatting:** a popular name plus a believable word: `lodash-utils`, `react-dom-helpers`. Close in meaning, far in edit distance.",
        ]),
        p("A distance check catches the first two families well and some of the third. It cannot catch combosquats or invented names that are not near anything: for those you rely on the allowlist and package age (lesson 1.3) and on the scope and existence checks of lesson 2.1. Every layer catches what the others miss."),

        h2("3. Core idea: compare what a reader sees"),
        h3("Edit distance, and why swaps matter"),
        p("The edit distance of two names is the smallest number of single-character edits that turns one into the other. Plain **Levenshtein** distance allows three edits: insert, delete, substitute. Swapping two neighbouring letters then costs 2 (two substitutions), so `reqeust` is 2 away from `request`, just as far as a completely different pair of letters. **Damerau-Levenshtein** adds the swap of two adjacent characters as one edit, which matches how people mistype. Its common restricted form, the **optimal string alignment** distance, adds one case to the usual table: when the last two characters of each prefix are the same pair in the opposite order, you may reach the cell from two rows and two columns back, for a cost of 1."),
        code("text", `
       ""  r  e  q  u  e  s  t
""      0  1  2  3  4  5  6  7
r       1  0  1  2  3  4  5  6
e       2  1  0  1  2  3  4  5
q       3  2  1  0  1  2  3  4
e       4  3  2  1  1  1  2  3
u       5  4  3  2  1  2  2  3      <- row u, column e (the second e): 2
s       6  5  4  3  2  2  2  3
t       7  6  5  4  3  3  3  2      <- bottom-right cell: Levenshtein = 2`, "Levenshtein table for \"reqeust\" (rows) and \"request\" (columns)"),
        p("Each cell is the distance between a prefix of `reqeust` and a prefix of `request`. Look at row `u`, column `e` (the second `e`): the prefixes are `reqeu` and `reque`, which end in the same pair in the opposite order (`eu` and `ue`). Levenshtein can only get there with two edits, so the cell says 2. The swap case reaches it from row `q`, column `q`, two rows and two columns back, where the value is 0, for a cost of 1. The rest of both names matches, so that 1 carries down to the bottom-right cell: the Damerau-Levenshtein distance is 1."),
        h3("Normalize before you measure"),
        p("Before measuring, rewrite both names into the form a hurried reader perceives: lowercase, the scope removed, `_` and `.` turned into `-`, `1` read as `l` and `0` as `o`, and a `js-` prefix or `-js` suffix dropped. After that, `Cha1k.js`, `js-chalk`, `chalk_js` and `@evil/chalk` all become `chalk`, distance 0."),
        p("Distance 0 after normalization is not a match. It is the strongest warning the detector can give: someone built that name to look like `chalk`. Only the **raw** name, character for character, decides whether a candidate *is* a popular package."),
        h3("Thresholds depend on length"),
        p("Short names live close together. `qs`, `ms`, `pg` and `ws` are all popular, legitimate, and one edit from each other. With a threshold of 1 on two-letter names every one of them would flag the others, reviewers would learn to ignore the warning, and you would be back to approvals by shape. Longer names have room: two edits from `typescript` is still clearly a misspelling of it. A defensible starting point, used in the challenge:"),
        code("text", `
normalized length   flag when distance <=
1-3                 0   (only character tricks: z0d, Zod)
4-7                 1   (chlak, expres, uuidd)
8 and more          2   (typescirpt, i18nexxt, crossenv)`, "thresholds"),
        callout("info", "When not to block",
            "A lookalike verdict is a reason for a human to look, with evidence, not an automatic rejection. preact is one edit from react and is a real, popular project. Put the names your team has reviewed and uses in the popular list too: an exact match then passes, and the detector stays quiet on the packages you already know. Measure the noise before you turn the check into a gate: run it on today's lockfile and explain every lookalike it reports."),

        challenge("chal_quiz_ssc_221"),

        h2("4. Worked example: reading the detector's report"),
        p("Run on the October approvals plus two candidates from an open PR, against a popular list of a few hundred names (the top packages by weekly downloads, plus every package CodeDev already depends on), the detector prints one line per name, riskiest first:"),
        code("text", `
verdict     name                  nearest        distance
lookalike   @codedev-tools/axios  axios          0     scope removed: a popular name in an unreviewed scope
lookalike   crossenv              cross-env      1     a dropped separator, length 8: threshold 2
lookalike   reqeust               request        1     one swap; plain Levenshtein says 2 and misses it
clear       zod-schema-kit        ...            7+    far from every popular name: no opinion
exact       react-dom             react-dom      0`, "detector output, PR #1207 and the October approvals"),
        p("Read the `clear` line carefully. It does not say the package is safe; it says the name is not near a popular name. `zod-schema-kit` could be a combosquat or an invented name, and the allowlist and age checks still apply to it. The detector answers one question well: does this name imitate one we know?"),
        p("Where it runs: on every name in the lockfile that is new compared with the main branch, not only on the direct dependencies in `package.json`. A typosquat can arrive as a dependency of a dependency, and the lockfile is where you see the whole tree."),
        code("yaml", `
# .github/workflows/deps.yml (excerpt)
- name: New package names
  run: |
    git show origin/main:package-lock.json > /tmp/base-lock.json
    node scripts/new-names.mjs /tmp/base-lock.json package-lock.json > /tmp/new-names.json
- name: Typosquat check
  run: node scripts/typosquat.mjs --popular config/popular-packages.json /tmp/new-names.json`, "CI: check only the names this PR adds"),

        h2("5. The challenge: build the detector"),
        p("Write `detectTyposquats(popular, candidates)`: validate each name, recognise exact matches, normalize, compute the restricted Damerau-Levenshtein distance to every popular name, pick the nearest, apply the threshold by length, and sort the report. The description gives every rule, including how ties are broken. Test the three helpers separately on names you can check by hand before you run the tests."),
        challenge("chal_coding_ssc_222"),

        h2("6. How to verify a detector"),
        bullets([
            "**A table of known attack names** as a test: `crossenv`, `reqeust`, `chlak`, `cross_env`, `cha1k`, `@evil/chalk`, each with the popular name it must point to. Add every real catch to the table, so the detector never forgets one.",
            "**A table of names that must stay quiet:** every exact popular name, and short neighbours such as `ws` next to `qs`. A detector that cries wolf is worse than none, because people stop reading it.",
            "**The false positive rate on your own lockfile.** Run it on today's full dependency tree: every lookalike must be explained (a real fork, a renamed package) or added to the popular list after review.",
            "**A Levenshtein-only build should fail your tests.** If the tests pass with the swap case removed, they do not test swaps.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Comparing raw strings only.** `cross_env` and `@evil/chalk` are many edits from their targets until you normalize. Spot it: tests without separator, digit, suffix or scope tricks.",
            "**Treating a normalized match as exact.** That turns the best catch into an approval. Spot it: an exact check that calls normalize.",
            "**One threshold for every length.** Too low misses long typos, too high flags every short name. Spot it: `ws` reported as a lookalike of `qs`, or `typescirpt` reported as clear.",
            "**Checking only direct dependencies.** The lockfile has the whole tree. Spot it: the checker reads `package.json` and never the lockfile.",
            "**Reading clear as safe.** Combosquats and invented names are far from everything. Spot it: a pipeline where the detector is the only check for new names.",
        ]),

        h2("8. Summary"),
        numbered([
            "Typosquats and many slopsquats are built to read like a popular name: swaps, missing letters, separators, digit swaps, suffixes and foreign scopes. Reviewers read by shape, so this check must be automated.",
            "Normalize names the way a reader sees them, then use Damerau-Levenshtein so that a swap counts as one edit. Exact means the raw name matches; distance 0 after normalization is the strongest warning.",
            "Use thresholds by length (short names only match after normalization), keep your reviewed names in the popular list, and remember that clear only means \"not near a known name\": allowlists, age and scope checks cover the rest.",
        ]),

        h2("Sources"),
        bullets([
            "npm Docs: package name rules (package.json \"name\") - docs.npmjs.com/cli/v10/configuring-npm/package-json",
            "npm Docs: package-lock.json - docs.npmjs.com/cli/v10/configuring-npm/package-lock-json",
            "Damerau, F. J. (1964), A technique for computer detection and correction of spelling errors, Communications of the ACM 7(3)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Export the names of every package in your project's lockfile and run a detector like the one from the challenge against a list of popular names plus your own dependencies. For each lookalike, write one line: a real problem, a legitimate fork, or noise. Then pick the thresholds that keep the noise under a handful of lines, and write down why, so the next person to change them knows what they trade."),
    ],
});
