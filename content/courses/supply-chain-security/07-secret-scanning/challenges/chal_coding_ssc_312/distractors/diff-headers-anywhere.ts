// @piece diff-headers: Follow the file and hunk headers
const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
if (line.startsWith("diff --git ")) {
    file = null;
    inHunk = false;
    continue;
}
if (line.startsWith("@@")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    inHunk = m !== null;
    if (m) newLine = Number(m[1]);
    continue;
}
if (line.startsWith("+++") || line.startsWith("---")) inHunk = false;
if (!inHunk) {
    if (line.startsWith("+++ ")) {
        const path = line.slice(4);
        file = path === "/dev/null" ? null : path.startsWith("b/") ? path.slice(2) : path;
    }
    continue;
}
