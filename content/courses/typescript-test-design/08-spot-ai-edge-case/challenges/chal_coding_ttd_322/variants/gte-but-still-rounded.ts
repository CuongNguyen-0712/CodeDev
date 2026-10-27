import { readFileSync } from "node:fs";

// Spot the AI Mistake: the 80% certificate boundary.
// The request sent to an AI coding assistant was:
//   "Write isEligibleForCertificate(completed, required) for the CodeDev certificate service.
//    A learner gets the course certificate when they have completed at least 80% of the required
//    items (lessons and graded challenges). Return true or false."
// The assistant wrote the function below and three tests (9 of 10 -> true, 1 of 2 -> false,
// 10 of 10 -> true). They pass, coverage of the file is 100%, and the pull request was merged.
//
// Support tickets since the release:
//   - "I finished 4 of the 5 items of 'Git Basics' (80%) and I get no certificate."
//   - "33 of 41 is 80.5%, still no certificate."
//   - A course whose required items were all removed by mistake hands out certificates to
//     every learner who opens it.
//
// Fix isEligibleForCertificate so that it does exactly what the request says:
//   - eligible when completed is at least 80% of required; exactly 80% counts;
//   - a course with no required items (required = 0) gives no certificate;
//   - invalid input gives no certificate: completed or required is not a whole number,
//     completed is below 0, or completed is greater than required.
// Do not change the test runner.

function isEligibleForCertificate(completed: number, required: number): boolean {
    if (required === 0) return true; // nothing to complete, so nothing is missing
    const percent = Math.round((completed / required) * 100); // e.g. 41 of 50 -> 82
    return percent >= 80;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of [completed, required] pairs. Up to 20 pairs: one line per pair.
// More than 20: one summary line with the number of eligible pairs.
const pairs: Array<[number, number]> = JSON.parse(readFileSync(0, "utf8"));
const results = pairs.map(([completed, required]) => isEligibleForCertificate(completed, required));
if (pairs.length <= 20) {
    pairs.forEach(([completed, required], i) => {
        console.log(`${completed} of ${required}: ${results[i] ? "eligible" : "not eligible"}`);
    });
} else {
    const eligible = results.filter(Boolean).length;
    console.log(`${pairs.length} pairs: ${eligible} eligible, ${pairs.length - eligible} not eligible`);
}
