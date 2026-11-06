// @piece collect-reasons: Every reason that applies, in spec order
const reasons: Reason[] = [];
if (!course.requiredLessons.every((id) => lessons.has(id))) reasons.push("lessons_incomplete");
const passed = (r.passedQuizzes as string[]).length;
if (passed * 100 < course.quizPassPercent * courseQuizzes.size) reasons.push("quiz_rate_too_low");
if (!course.codingChallenges.every((id) => coding.has(id))) reasons.push("coding_not_passed");
if (r.revoked === true) reasons.push("revoked");
if (r.issuedAt !== null) reasons.push("already_issued");
