// @piece paths-to-check: The paths to check, two for a rename
const toCheck: { path: string; change: string }[] = [];
for (const c of changes) {
    if (c.status === "renamed") {
        toCheck.push({ path: c.path, change: "renamed-to" });
    } else {
        toCheck.push({ path: c.path, change: c.status });
    }
}
