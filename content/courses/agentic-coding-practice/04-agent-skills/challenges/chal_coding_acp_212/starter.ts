import { readFileSync } from "node:fs";

// CodeDev skill check (CI): validates one SKILL.md before an agent ever sees it.
//
// SKILL.md = "---" line, frontmatter (key: value lines), "---" line, markdown body.
// The full rules (parsing, check order, exact messages) are in the challenge description.
//
// validateSkill(file) returns the errors in this order, [] when the skill is valid:
//   "missing frontmatter"  (alone: no other checks)
//   "name: missing" | "name: invalid characters", "name: too long", "name: does not match folder \"<folder>\""
//   "description: missing" | "description: too long", "description: does not say when to use the skill"
//   "body: empty"
// No libraries: parse the small YAML subset yourself.

type SkillFile = { folder: string; content: string };

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;

function validateSkill(file: SkillFile): string[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
const input: SkillFile = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(validateSkill(input)));
