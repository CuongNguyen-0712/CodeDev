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
        frontmatter.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    return { frontmatter, body: lines.slice(end + 1).join("\n") };
}
