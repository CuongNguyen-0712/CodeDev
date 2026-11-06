// @piece added-lines: Scan added lines and keep the line number
if (line.startsWith("+") || line.startsWith("-")) {
    const lineNo = newLine++;
    const content = line.slice(1);
    if (file === null || allowPaths.some((p) => file!.startsWith(p)) || content.includes(ALLOW_MARKER)) continue;
    for (const { rule, secret } of scanLine(content)) findings.push({ file, line: lineNo, rule, preview: preview(secret) });
} else if (line.startsWith(" ") || line === "") {
    newLine++;
}
// "-" (removed) and "\" (no newline at end of file) do not move the new-file line number.
