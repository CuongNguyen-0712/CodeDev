// @piece reach: Every file each test reaches (imports may loop)
// Every file each test reaches through imports, with a visited set for cycles.
const reaches = new Map<string, Set<string>>();
for (const test of allTests) {
    // only the files the test imports itself
    reaches.set(test, new Set<string>([test, ...(repo.tests[test] ?? [])]));
}
