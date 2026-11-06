// @piece inputs: Test files, changed paths, deleted paths, runAll
const allTests = Object.keys(repo.tests).sort(byCodeUnit);
const changed = [...new Set(repo.changed.filter((c) => c.status !== "deleted").map((c) => c.path))].sort(byCodeUnit);
const deleted = new Set(repo.changed.filter((c) => c.status === "deleted").map((c) => c.path));
const runAll = new Set(repo.runAll);
