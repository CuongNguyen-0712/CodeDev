import { readFileSync } from "node:fs";

// CodeDev skill check (CI): validates one SKILL.md before an agent ever sees it.
// Reference solution.

type SkillFile = { folder: string; content: string };

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function unquote(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        if ((first === '"' || first === "'") && value[value.length - 1] === first) return value.slice(1, -1);
    }
    return value;
}

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

function validateSkill(file: SkillFile): string[] {
    const parsed = parseSkill(file.content);
    if (parsed === null) return ["missing frontmatter"];
    const errors: string[] = [];

    const name = parsed.frontmatter.get("name") ?? "";
    if (name === "") {
        errors.push("name: missing");
    } else {
        if (!NAME_PATTERN.test(name)) errors.push("name: invalid characters");
        if (name.length > NAME_MAX) errors.push("name: too long");
        if (name !== file.folder) errors.push(`name: does not match folder "${file.folder}"`);
    }

    const description = parsed.frontmatter.get("description") ?? "";
    if (description === "") {
        errors.push("description: missing");
    } else {
        if (description.length > DESCRIPTION_MAX) errors.push("description: too long");
        if (!description.includes("Use when")) errors.push("description: does not say when to use the skill");
    }

    if (parsed.body.trim() === "") errors.push("body: empty");
    return errors;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: SkillFile = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(validateSkill(input)));
