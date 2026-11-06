// @piece judge-paths: The first violation of each path, if any
for (const { path, change } of toCheck) {
    if (invalidPath(path)) {
        violations.push({ path, change, reason: "invalid path" });
        continue;
    }
    const isAllowed = allowed.some((p) => matchGlob(p, path));
    const hit = forbidden.find((f) => matchGlob(f.pattern, path));
    if (hit) violations.push({ path, change, reason: `forbidden: ${hit.pattern}` });
    else if (!isAllowed) violations.push({ path, change, reason: "outside allowed paths" });
}
