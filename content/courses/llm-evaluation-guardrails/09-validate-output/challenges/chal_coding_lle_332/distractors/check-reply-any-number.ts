// @piece check-reply: Check the reply field by field
if (typeof output !== "object" || output === null || Array.isArray(output)) return "invalid_json";
const { score, feedback } = output as Record<string, unknown>;
if (score === undefined || score === null) return "score_missing";
if (typeof score !== "number") return "score_not_integer";
if (typeof feedback !== "string") return "feedback_missing";
const length = feedback.trim().length;
if (length < 10 || length > 1000) return "feedback_length";
if (score > job.testScore + MAX_ABOVE_TESTS) return "above_test_cap";
return null;
