// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Shell blocks are normal template literals: every shell \${...} is escaped so JavaScript keeps it as text.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-3-2",
    title: "Semantic versioning & changelogs",
    slug: { _type: "slug", current: "devops-semantic-versioning-changelogs" },
    description:
        "Rice Rocket's release script picked the latest tag with a plain text sort, so v1.9.0 beat v1.10.0 and the deploy rolled back two weeks of fixes; a week later a removed API field shipped as a patch release and broke the mobile app. Learn what MAJOR.MINOR.PATCH promises, how pre-releases and build metadata compare, why sort and sort -V both get it wrong, how to tag releases in git, how Conventional Commits decide the next version, and how to write a changelog people actually read.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The release job tags main, builds the image and deploys \"the latest version\". After v1.10.0 was tagged, the job deployed v1.9.0 instead - two weeks of fixes disappeared from production until someone noticed the old menu bug was back. The next week, v1.10.1 removed the field orders.total from the API. A patch release promises nothing breaks, so the mobile team had auto-upgraded the API client, and the app showed an empty total on every order.",
    },

    content: [
        h2("1. The incident"),
        p("The deploy step of the release job was two lines of bash:"),
        code("bash", `
latest=$(git tag | sort | tail -n 1)
./deploy.sh "ghcr.io/ricerocket/api:\${latest#v}"`, "release.sh"),
        p("It had worked for nine releases - from v1.1.0 to v1.9.0 - because every version number had one digit per part. On the tenth release it broke without an error:"),
        bullets([
            "**`sort` compares text, one character at a time.** `v1.10.0` and `v1.9.0` are equal up to `v1.`; then `1` comes before `9`, so `v1.10.0` sorts **before** `v1.9.0`, and `tail -n 1` returns `v1.9.0`. The job deployed an older image and reported success.",
            "**The version number lied.** `v1.10.1` removed a field from the orders API. A patch number tells every client \"bug fixes only, safe to upgrade\" - so the mobile app's dependency bot upgraded automatically.",
            "**Nobody could tell what was in a release.** There was no changelog, only a list of commits like `fix stuff` and `wip`, so the mobile team found the removed field in production, not in the release notes.",
        ]),

        h2("2. Reproduce it"),
        p("Run this in any bash shell:"),
        code("bash", `
$ printf 'v1.9.0\\nv1.10.0\\nv1.2.3\\n' | sort
v1.10.0
v1.2.3
v1.9.0

$ printf 'v1.9.0\\nv1.10.0\\nv1.2.3\\n' | sort -V
v1.2.3
v1.9.0
v1.10.0`),
        p("`sort -V` (**version sort**, GNU coreutils) compares runs of digits as numbers, which fixes the release case. But it does not know SemVer's pre-release rule:"),
        code("bash", `
$ printf 'v2.0.0\\nv2.0.0-rc.1\\n' | sort -V
v2.0.0
v2.0.0-rc.1`),
        p("To `sort -V`, `v2.0.0` is a prefix of `v2.0.0-rc.1`, so it comes first - and `tail -n 1` would deploy the release candidate instead of the final release. To get versions right you need the actual rules, so let us look at them."),

        h2("3. What a version number promises"),
        p("**Semantic Versioning** (SemVer 2.0.0, semver.org) gives each part of `MAJOR.MINOR.PATCH` a meaning, relative to your **public API** - whatever other people's code depends on: the JSON your HTTP API returns, the functions of a library, the flags of a CLI."),
        bullets([
            "**PATCH** (`1.10.0 -> 1.10.1`): backwards-compatible bug fixes. Clients upgrade without reading anything.",
            "**MINOR** (`1.10.1 -> 1.11.0`): new functionality that is backwards compatible - a new endpoint, a new optional field. PATCH goes back to 0.",
            "**MAJOR** (`1.11.0 -> 2.0.0`): any incompatible change - removing or renaming a field, changing a type, making an optional parameter required. MINOR and PATCH go back to 0.",
        ]),
        p("For Rice Rocket's API, removing `orders.total` is incompatible, so the release had to be `2.0.0` (or, better, a MINOR release that adds `total_vnd` and marks `total` as deprecated, and a later MAJOR release that removes it). The numbers are a **contract**: tools like Dependabot, Renovate and pip/npm version ranges (`~=1.10`, `^1.10.0`) upgrade automatically on the assumption that you keep it."),
        callout("info", "A released version never changes",
            "SemVer says the contents of a released version must not be modified. If v1.10.1 is broken, you release v1.10.2 (or roll back to v1.10.0) - you do not delete the tag and push a different v1.10.1. Somebody may already have pulled it, and two different things with one name are much harder to debug than a fix with a new number."),

        h2("4. Pre-releases, build metadata and precedence"),
        p("A version can have two optional parts after the three numbers:"),
        bullets([
            "**Pre-release**, after `-`: `2.0.0-alpha`, `2.0.0-beta.2`, `2.0.0-rc.1`. Dot-separated identifiers made of `[0-9A-Za-z-]`; numeric ones have no leading zeros. A pre-release is unstable and has **lower** precedence than the normal version.",
            "**Build metadata**, after `+`: `2.0.0+20261014.sha.5f2c1e9`. It records how something was built and is **ignored** when comparing versions: `2.0.0+a` and `2.0.0+b` have the same precedence.",
            "**A leading `v`** (`v2.0.0`) is not part of SemVer, but it is the usual way to name git tags; strip it before comparing.",
        ]),
        h3("The precedence rules (SemVer section 11)"),
        numbered([
            "Compare MAJOR, MINOR and PATCH **as numbers**, left to right. The first difference decides: `1.10.0 > 1.9.0` because 10 > 9.",
            "If they are equal, a version **without** a pre-release is higher: `2.0.0 > 2.0.0-rc.10`.",
            "Two pre-releases are compared identifier by identifier: numbers as numbers (`rc.2 < rc.10`), text in ASCII order (`alpha < beta < rc`), and a number is always lower than text (`1 < alpha`).",
            "If all identifiers so far are equal, the one with **more** identifiers is higher: `alpha < alpha.1`.",
        ]),
        image("text-sort-vs-semver", {
            alt: "Left, red, Plain text sort with git tag | sort | tail -n 1: the tags sort as v1.10.0, v1.2.3, v1.9.0, because v1.1 comes first when the character 1 is less than 2 and 9; tail -n 1 picks v1.9.0, which was deployed; text compares one character at a time, so 10 sorts before 9 and two weeks of fixes were rolled back. Right, green, SemVer precedence comparing MAJOR, MINOR and PATCH as numbers: v1.2.3, v1.9.0, v1.10.0, because MINOR 9 is less than 10, so v1.10.0 is the latest release; 1 equals 1, then 10 is greater than 9 and PATCH is not even read; in bash sort -V works for releases only, in code compare tuples. Bottom, pre-releases from lowest to highest: 2.0.0-alpha, 2.0.0-alpha.1, 2.0.0-beta, 2.0.0-rc.2, 2.0.0-rc.10, 2.0.0. Notes: alpha is less than alpha.1 because with all parts so far equal, fewer parts is lower; rc.2 is less than rc.10 because numeric parts compare as numbers; 2.0.0 is greater than every 2.0.0 pre-release because the release comes last; build metadata such as 2.0.0+linux never changes the order.",
            caption: "Versions are tuples of numbers with a pre-release rule on top - never plain text.",
        }),
        p("In Python, this becomes a **sort key**: a tuple that Python's normal tuple comparison orders correctly. The first part is easy:"),
        code("python", `
def release_key(tag):
    major, minor, patch = tag.removeprefix("v").split(".")
    return (int(major), int(minor), int(patch))


tags = ["v1.9.0", "v1.10.0", "v1.2.3"]
print(sorted(tags))                     # ['v1.10.0', 'v1.2.3', 'v1.9.0']   text
print(sorted(tags, key=release_key))    # ['v1.2.3', 'v1.9.0', 'v1.10.0']   numbers
print(max(tags, key=release_key))       # v1.10.0`),
        p("Pre-releases need two more ideas: a flag that puts the release after its pre-releases, and an identifier-by-identifier part where a number sorts before text. Tuples compare element by element and a shorter tuple that is a prefix of a longer one is smaller - exactly rule 4. You will build that key in the challenge."),

        h2("5. 0.x versions and 1.0.0"),
        p("SemVer gives versions that start with `0.` a special meaning: **initial development**. Anything may change at any time, and the public API should not be considered stable. Version `1.0.0` is the moment you declare a public API and start keeping the contract."),
        bullets([
            "Libraries often stay on `0.x` for a long time. Package managers know it: `^0.4.2` in npm allows `0.4.x` only, not `0.5.0`.",
            "Some release tools bump **MINOR** instead of MAJOR for a breaking change while MAJOR is 0 (release-please has an option for it). Know which rule your tool uses before trusting its numbers.",
            "Rice Rocket's API is used by a mobile app in the stores: it is past 1.0.0 whether the number says so or not.",
        ]),

        h2("6. Tags in git"),
        p("A release is a **git tag** on the commit that was built. Use **annotated** tags: they store who tagged, when, and a message, and `git describe` uses them by default. A lightweight tag (`git tag v1.10.0` without `-a`) is only a name for a commit."),
        code("bash", `
$ git tag -a v1.10.0 -m "v1.10.0: refunds API, dispatch retries"
$ git push origin v1.10.0                       # tags are not pushed by a plain git push

$ git describe --tags                           # where am I, relative to the last tag?
v1.10.0-3-g5f2c1e9                              # 3 commits after v1.10.0, at commit 5f2c1e9

$ git tag --list 'v*' --sort=v:refname          # version order instead of text order
v1.2.3
v1.9.0
v1.10.0`),
        p("`--sort=v:refname` has the same blind spot as `sort -V` for pre-releases. Git can be told about it: `git -c versionsort.suffix=- tag --list --sort=v:refname` sorts tags that contain `-` before the matching release. A release script should still not trust any sort it did not test - or better, it should not search for \"the latest\" at all and deploy the exact tag that triggered it (`github.ref_name` in GitHub Actions)."),

        h2("7. Conventional Commits decide the next version"),
        p("Choosing MAJOR, MINOR or PATCH by hand is how a removed field ships as a patch. **Conventional Commits** (conventionalcommits.org) is a format for commit messages that makes the choice mechanical:"),
        code("text", `
<type>[(scope)][!]: <description>

[optional body]

[optional footer(s)]`),
        bullets([
            "**`fix(checkout): retry the payment callback once`** - a bug fix: PATCH.",
            "**`feat(menu): show the spicy level`** - a new feature: MINOR.",
            "**`feat(api)!: remove orders.total`** - the `!` before `:` marks a breaking change: MAJOR, whatever the type.",
            "**A footer `BREAKING CHANGE: orders.total is removed`** (or `BREAKING-CHANGE:`) also marks a breaking change, even on a `refactor:` or `chore:` commit. It must be written in capitals.",
            "**Other types** - `docs`, `chore`, `ci`, `test`, `refactor`, `style`, `build`, and `perf` - do not add features. Most tools release `perf` as a PATCH and the rest not at all.",
        ]),
        p("The next version is then the **largest** bump any commit since the last release asks for: one breaking commit among fifty fixes still makes it a MAJOR release. Tools such as semantic-release and release-please read the commits, compute the version, create the tag and write the changelog. A commit-message check in CI (commitlint) keeps the history readable for them."),
        code("text", `
$ git log --format=%s v1.10.0..HEAD
fix(checkout): retry the payment callback once
docs: explain the refund flow
refactor(api): rename orders.total to orders.total_vnd     <- body has "BREAKING CHANGE: ..."
feat(orders): add a pickup time to orders

largest bump: major   ->   v1.10.0 becomes v2.0.0`),

        h2("8. A changelog for humans"),
        p("`git log` is for the people who wrote the code. A **changelog** is for the people who use it: what changed, what breaks, what they must do. The common format is **Keep a Changelog** (keepachangelog.com): newest release first, an `Unreleased` section at the top, and changes grouped by kind."),
        code("text", `
# Changelog

## [Unreleased]

## [2.0.0] - 2026-10-21
### Removed
- **Breaking:** orders.total is removed. Read orders.total_vnd (an integer, in VND) instead.

### Added
- Orders have an optional pickup_time.

### Fixed
- The payment callback is retried once before an order is marked as failed.

## [1.10.0] - 2026-10-14
### Added
- Refunds API: POST /orders/{id}/refunds.`, "CHANGELOG.md"),
        bullets([
            "Keep a Changelog's groups are **Added, Changed, Deprecated, Removed, Fixed, Security**. Generated changelogs (from Conventional Commits) use similar groups - Breaking changes, Features, Fixes - built straight from the commit headers.",
            "**Breaking changes come first** and say what the reader has to do, not just what you did.",
            "**Deprecate before you remove**: one MINOR release that adds the new field and marks the old one as deprecated gives clients time to move before the MAJOR release.",
            "Dates are ISO 8601 (`2026-10-21`), so nobody wonders whether 10/11 is October or November.",
        ]),

        h2("9. Your turn"),
        p("Rebuild the part of the release job that went wrong: order the tags by real SemVer precedence, find the latest stable release, read the commits since then, choose the bump and the next version, and group the commits into a changelog."),
        challenge("chal_coding_devf_321", "Turn each matching tag into a key tuple (major, minor, patch, release flag, identifiers) where the release flag is 1 for a normal version and 0 for a pre-release, and each pre-release identifier is (0, number) or (1, text). For the commits, match only the first line against HEADER, then look for the BREAKING CHANGE footer in the other lines."),

        h2("10. Pitfalls"),
        bullets([
            "**Sorting versions as text** - `sort`, `max(tags)`, `ORDER BY tag` - works until the first two-digit number.",
            "**`sort -V` and `--sort=v:refname` with pre-releases**: `2.0.0` sorts before `2.0.0-rc.1` unless you configure the suffix.",
            "**Comparing build metadata**: `+linux` and `+build.7` never change the order.",
            "**Choosing the bump by hand** - or by the commit type only: a `refactor:` with a `BREAKING CHANGE:` footer is still a MAJOR release.",
            "**Moving or re-using a tag** after a release: anyone who already pulled it now has a different thing with the same name.",
            "**Deploying \"the latest tag\"** found by searching, instead of the exact tag or image digest that was built and tested.",
            "**A changelog that is a dump of commit messages**: readers need to know what breaks and what to do.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Your version numbers follow SemVer, and you know what your public API is.",
            "Versions are compared as numbers with the pre-release rules - never as text; build metadata is ignored.",
            "Releases are annotated git tags on the built commit, never moved or deleted after they are pushed.",
            "Commits follow Conventional Commits, checked in CI, and the next version comes from the largest bump among them.",
            "Breaking changes are announced first in the changelog, with what the reader must do; old fields are deprecated before they are removed.",
            "The deploy uses the exact tag that triggered it, not a search for \"the latest\".",
        ]),
    ],
});
