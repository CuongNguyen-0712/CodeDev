// @piece description-checks: Checks on the description
const description = parsed.frontmatter.get("description") ?? "";
if (description === "") {
    errors.push("description: missing");
} else {
    if (description.length > DESCRIPTION_MAX) errors.push("description: too long");
    if (!description.includes("Use when")) errors.push("description: does not say when to use the skill");
}
