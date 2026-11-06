// @piece context-files: Choose the files sent to the model
const byPath = new Map(files.map((f) => [f.path, f]));
const test = byPath.get(failure.testFile);
const wanted = test ? [test.path, ...files.map((f) => f.path)] : [];
const picked: RepoFile[] = [];
const seen = new Set<string>();
let used = 0;
for (const path of wanted) {
    const file = byPath.get(path);
    if (!file || seen.has(path)) continue;
    seen.add(path);
    if (used + file.tokens > budgetTokens) continue;
    picked.push(file);
    used += file.tokens;
}
return picked;
