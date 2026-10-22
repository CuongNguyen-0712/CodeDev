"""
Prepare Rice Rocket's next release: order the git tags, find the latest release, pick the next version
from the commit messages and group them into a changelog.

`tags` are the names printed by `git tag`, in any order. `commits` are the full commit messages since
the latest release, oldest first (first line = header, then an optional body and footers).

Requirements:
  - A tag is a version when it matches VERSION below: an optional "v", MAJOR.MINOR.PATCH (no leading
    zeros), an optional pre-release after "-" and optional build metadata after "+".
    Other tags ("latest", "v1.2", "v01.2.3", "release-7") are ignored.
  - "sorted": the version tags, lowest first, by SemVer 2.0.0 precedence:
      * compare MAJOR, MINOR, PATCH as numbers (1.10.0 > 1.9.0);
      * a pre-release is lower than the same version without one (2.0.0-rc.1 < 2.0.0);
      * two pre-releases are compared identifier by identifier (split on "."): numbers as numbers,
        other identifiers as text (ASCII), a number is lower than text, and when all identifiers
        so far are equal the shorter list is lower
        (alpha < alpha.1 < alpha.beta < beta < beta.2 < beta.11 < rc.1);
      * build metadata is ignored, so tags with equal precedence keep their input order.
    Print the tags exactly as they were given.
  - "latest": the highest version without a pre-release (the last one in "sorted"), or None.
  - A commit counts when its header matches HEADER below - type(scope)!: description - (Conventional
    Commits; the type is compared in lowercase, so "Feat" is "feat"). Other commits are ignored.
    A commit is breaking when its header has "!" before ":" or any line of the message starts with
    "BREAKING CHANGE: " or "BREAKING-CHANGE: ".
  - "bump": "major" if any counted commit is breaking, else "minor" if any type is feat,
    else "patch" if any type is fix or perf, else None.
  - "next": the version after "latest" (or after v0.0.0 when there is no latest) for that bump,
    always written "vMAJOR.MINOR.PATCH": major 1.4.2 -> 2.0.0, minor 1.4.2 -> 1.5.0, patch 1.4.2 -> 1.4.3.
    None when "bump" is None.
  - "changelog": entries in commit order, under "Breaking changes" (every breaking commit, whatever its
    type), "Features" (other feat commits) and "Fixes" (other fix and perf commits). An entry is
    "scope: description" when the header has a scope, else the description. Leave out empty sections.

Example: tags ["v1.9.0", "v1.10.0", "v1.2.3"], commits ["feat(menu): show spicy level", "fix: round VAT"]
  -> {"sorted": ["v1.2.3", "v1.9.0", "v1.10.0"], "latest": "v1.10.0", "bump": "minor", "next": "v1.11.0",
      "changelog": {"Features": ["menu: show spicy level"], "Fixes": ["round VAT"]}}
"""
import json
import re
import sys

VERSION = re.compile(
    r"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$",
    re.ASCII,
)
HEADER = re.compile(r"^(\w+)(?:\(([^()]+)\))?(!)?: (.+)$", re.ASCII)


def precedence(match):
    major, minor, patch, pre = int(match[1]), int(match[2]), int(match[3]), match[4]
    if pre is None:
        return (major, minor, patch, 1, ())  # a release sorts after all of its pre-releases
    ids = tuple((0, int(part), "") if part.isdigit() else (1, 0, part) for part in pre.split("."))
    return (major, minor, patch, 0, ids)


def plan_release(tags: list, commits: list) -> dict:
    versions = [(tag, VERSION.match(tag)) for tag in tags]
    versions = sorted([(tag, m) for tag, m in versions if m], key=lambda tm: tm[0])
    stable = [(tag, m) for tag, m in versions if m[4] is None]
    latest = stable[-1] if stable else None

    sections = {"Breaking changes": [], "Features": [], "Fixes": []}
    for message in commits:
        lines = message.splitlines()
        header = HEADER.match(lines[0]) if lines else None
        if not header:
            continue
        kind, scope, bang, description = header[1].lower(), header[2], header[3], header[4]
        entry = f"{scope}: {description}" if scope else description
        breaking = bang is not None or any(line.startswith(("BREAKING CHANGE: ", "BREAKING-CHANGE: ")) for line in lines[1:])
        if breaking:
            sections["Breaking changes"].append(entry)
        elif kind == "feat":
            sections["Features"].append(entry)
        elif kind in ("fix", "perf"):
            sections["Fixes"].append(entry)

    if sections["Breaking changes"]:
        bump = "major"
    elif sections["Features"]:
        bump = "minor"
    elif sections["Fixes"]:
        bump = "patch"
    else:
        bump = None

    major, minor, patch = (int(latest[1][1]), int(latest[1][2]), int(latest[1][3])) if latest else (0, 0, 0)
    if bump == "major":
        next_version = f"v{major + 1}.0.0"
    elif bump == "minor":
        next_version = f"v{major}.{minor + 1}.0"
    elif bump == "patch":
        next_version = f"v{major}.{minor}.{patch + 1}"
    else:
        next_version = None

    return {
        "sorted": [tag for tag, _ in versions],
        "latest": latest[0] if latest else None,
        "bump": bump,
        "next": next_version,
        "changelog": {name: entries for name, entries in sections.items() if entries},
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"tags": [...], "commits": [...]}) from stdin and prints the plan as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(plan_release(case["tags"], case["commits"]), ensure_ascii=False))
