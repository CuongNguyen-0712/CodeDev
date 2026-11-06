// @piece pick-tests: Run everything, or the tests that reach a change
const all = false;
const tests = all ? allTests : allTests.filter((test) => changed.some((path) => reaches.get(test)!.has(path)));
