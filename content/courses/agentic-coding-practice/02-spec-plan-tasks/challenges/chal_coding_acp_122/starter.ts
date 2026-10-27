import { readFileSync } from "node:fs";

// CodeDev course certificates - spec docs/specs/certificates/spec.md, task T1: the eligibility check.
// Implement checkEligibility(course, record) exactly as the spec says. Nothing more, nothing less.
//
// 1. Validation. The record comes from an import file and is untrusted. It is invalid when:
//      - it is not an object (null, an array, a string ...),
//      - userId is not a string with at least one non-space character,
//      - completedLessons, passedQuizzes or passedCoding is missing or is not an array of strings,
//      - revoked is not a boolean,
//      - issuedAt is not null and not a number (a timestamp in ms; null = never issued).
//    An invalid record gives { eligible: false, reasons: ["invalid_record"] } and nothing else.
// 2. Otherwise collect every reason that applies, in this fixed order:
//      "lessons_incomplete"  a lesson in course.requiredLessons is not in completedLessons
//      "quiz_rate_too_low"   passed quizzes of this course * 100 < course.quizPassPercent * course.quizzes.length
//                            (count each id of course.quizzes once; ids from other courses do not count;
//                             a course with no quizzes passes this rule)
//      "coding_not_passed"   a challenge in course.codingChallenges is not in passedCoding
//      "revoked"             revoked is true
//      "already_issued"      issuedAt is not null (a certificate is issued once)
//    Ids are compared exactly (case-sensitive, no trimming). Duplicates in the learner's lists count once.
// 3. eligible is true exactly when reasons is empty.
//
// Do not change the types or the test runner.

type Course = {
    courseId: string;
    requiredLessons: string[];
    quizzes: string[];
    quizPassPercent: number; // an integer from 0 to 100
    codingChallenges: string[];
};

type Reason =
    | "invalid_record"
    | "lessons_incomplete"
    | "quiz_rate_too_low"
    | "coding_not_passed"
    | "revoked"
    | "already_issued";

type Eligibility = { eligible: boolean; reasons: Reason[] };

function checkEligibility(course: Course, record: unknown): Eligibility {
    return { eligible: true, reasons: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { course, records }. Output: one line of JSON with { userId, eligible, reasons } per record
// (userId is null when the record has no string userId).
const input: { course: Course; records: unknown[] } = JSON.parse(readFileSync(0, "utf8"));
const results = input.records.map((record) => {
    const id = typeof record === "object" && record !== null ? (record as { userId?: unknown }).userId : undefined;
    const { eligible, reasons } = checkEligibility(input.course, record);
    return { userId: typeof id === "string" ? id : null, eligible, reasons };
});
console.log(JSON.stringify(results));
