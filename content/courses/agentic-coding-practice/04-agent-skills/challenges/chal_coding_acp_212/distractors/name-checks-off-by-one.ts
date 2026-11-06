// @piece name-checks: Checks on the name
const name = parsed.frontmatter.get("name") ?? "";
if (name === "") {
    errors.push("name: missing");
} else {
    if (!NAME_PATTERN.test(name)) errors.push("name: invalid characters");
    if (name.length >= NAME_MAX) errors.push("name: too long");
    if (name !== file.folder) errors.push(`name: does not match folder "${file.folder}"`);
}
