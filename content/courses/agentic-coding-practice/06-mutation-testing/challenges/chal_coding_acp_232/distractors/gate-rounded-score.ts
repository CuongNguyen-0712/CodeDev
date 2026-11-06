// @piece gate: The quality gate
// Compare the exact score, not the rounded one: detected / valid >= threshold / 100.
const gate = overall.score !== null && overall.score >= run.threshold ? "pass" : "fail";
