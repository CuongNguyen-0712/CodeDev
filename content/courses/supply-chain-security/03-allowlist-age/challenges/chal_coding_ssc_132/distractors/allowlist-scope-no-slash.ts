// @piece allowlist-match: Is the package on the allowlist?
return allowlist.some((entry) =>
    entry.startsWith("@") && entry.endsWith("/*") ? name.startsWith(entry.slice(0, -2)) : name === entry);
