// @piece count-result: Record the result, slice counts and weights
const failed = (assertions as Assertion[])
    .filter((a) => !check(a, c.output))
    .map((a) => (typeof a.name === "string" && a.name !== "" ? a.name : (a.type as string)));
const pass = failed.length === 0;
results.push({ id: c.id, status: pass ? "pass" : "fail", failed });
s.total++;
weightAll += 1;
if (pass) {
    s.passed++;
    weightPassed += 1;
}
