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
    // @piece parse-or-stop: Stop at once when there is no frontmatter
    const parsed = parseSkill(file.content);
    if (parsed === null) return ["missing frontmatter"];
    // @end
    const errors: string[] = [];

    // @piece name-checks: Checks on the name
    const name = parsed.frontmatter.get("name") ?? "";
    if (name === "") {
        errors.push("name: missing");
    } else {
        if (!NAME_PATTERN.test(name)) errors.push("name: invalid characters");
        if (name.length > NAME_MAX) errors.push("name: too long");
        if (name !== file.folder) errors.push(`name: does not match folder "${file.folder}"`);
    }
    // @end

    // @piece description-checks: Checks on the description
    const description = parsed.frontmatter.get("description") ?? "";
    if (description === "") {
        errors.push("description: missing");
    } else {
        if (description.length > DESCRIPTION_MAX) errors.push("description: too long");
        if (!description.toLowerCase().includes("use when")) errors.push("description: does not say when to use the skill");
    }
    // @end

    // @piece body-check: Check on the body
    if (parsed.body.trim() === "") errors.push("body: empty");
    // @end
    return errors;
}

// @piece name-pattern: The allowed shape of a skill name
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// @end

// @piece unquote: Helper: drop matching quotes around a value
function unquote(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        if ((first === '"' || first === "'") && value[value.length - 1] === first) return value.slice(1, -1);
    }
    return value;
}
// @end

// @piece parse-skill: Split SKILL.md into frontmatter and body
function parseSkill(content: string): { frontmatter: Map<string, string>; body: string } | null {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    if (lines[0].trimEnd() !== "---") return null;
    const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
    if (end === -1) return null;
    const frontmatter = new Map<string, string>();
    for (const line of lines.slice(1, end)) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#") || /^\s/.test(line)) continue;
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        frontmatter.set(line.slice(0, colon).trim(), unquote(line.slice(colon + 1).trim()));
    }
    return { frontmatter, body: lines.slice(end + 1).join("\n") };
}
// @end

// ---------------------------------------------------------------- test runner (do not change)
const input: SkillFile = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(validateSkill(input)));
