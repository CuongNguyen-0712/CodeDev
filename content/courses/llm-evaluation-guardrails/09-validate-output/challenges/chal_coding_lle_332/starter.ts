import { readFileSync } from "node:fs";

// Output not validated. The CodeDev grading service asks the AI grader for JSON
// { "score": <integer 0-10>, "feedback": "<text>" } and writes the reply into the gradebook.
// Since the release of the new grading prompt the gradebook contains scores of 11, -1 and 9.5,
// submissions stuck without a score, and grading jobs that fail with
// `invalid input syntax for type numeric: "10/10"` until they are dead-lettered.
//
// Fix handleGradingResult. A reply is accepted only when it is a JSON object with an integer
// score from 0 to 10 and a feedback string of 10 to 1000 characters (after trimming), and the score
// is at most the automated test score + 2. Anything else is not repaired: the submission goes to
// human review with the reason of the first failed check, and its AI score stays empty. Every
// job records exactly one decision. Reasons, in the order they are checked:
//   invalid_json        the reply is not JSON, or not a JSON object (null, array, number, string)
//   score_missing       no "score", or "score": null
//   score_not_integer   the score is not a JSON number or not an integer ("8", "10/10", 9.5, true)
//   score_out_of_range  an integer below 0 or above 10
//   feedback_missing    "feedback" is not a string
//   feedback_length     the trimmed feedback is shorter than 10 or longer than 1000 characters
//   above_test_cap      score > testScore + 2 (the AI may lift a grade a little, never override the tests)
// Do not change the database fake or the test runner.

type GradingJob = { submissionId: string; testScore: number; modelOutput: string };
type Decision = { submissionId: string; outcome: "accepted" | "review"; reason: string | null };

const MAX_ABOVE_TESTS = 2;

function handleGradingResult(job: GradingJob, db: GradingDb): void {
    const output = JSON.parse(job.modelOutput);
    db.updateAiScore(job.submissionId, output.score, output.feedback);
    db.recordDecision({ submissionId: job.submissionId, outcome: "accepted", reason: null });
}

// ------------------------------------------------------------------ database fake (do not change)
// Behaves like the PostgreSQL table behind the gradebook: ai_score is numeric(4,1), so numbers are
// stored as given (rounded to one decimal), null and undefined become NULL, numeric-looking strings
// are converted and anything else fails the statement.
type Row = { id: string; aiScore: number | null; feedback: string | null; status: "pending" | "graded" | "needs_review" };

function toNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 10) / 10;
    if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Math.round(Number(value) * 10) / 10;
    throw new Error(`invalid input syntax for type numeric: "${String(value)}"`);
}

class GradingDb {
    rows = new Map<string, Row>();
    reviewQueue: { submissionId: string; reason: string }[] = [];
    decisions: Decision[] = [];

    // UPDATE submissions SET ai_score = $1, ai_feedback = $2, status = 'graded' WHERE id = $3
    updateAiScore(id: string, score: unknown, feedback: unknown): void {
        const row = this.row(id);
        const aiScore = toNumeric(score);
        row.aiScore = aiScore;
        row.feedback = feedback === null || feedback === undefined ? null : String(feedback);
        row.status = "graded";
    }

    // UPDATE submissions SET status = 'needs_review' WHERE id = $1; INSERT INTO review_queue (submission_id, reason) ...
    sendToReview(id: string, reason: string): void {
        this.row(id).status = "needs_review";
        this.reviewQueue.push({ submissionId: id, reason });
    }

    // INSERT INTO grading_decisions (submission_id, outcome, reason) ...
    recordDecision(decision: Decision): void {
        this.decisions.push({ submissionId: decision.submissionId, outcome: decision.outcome, reason: decision.reason });
    }

    private row(id: string): Row {
        const row = this.rows.get(id);
        if (!row) throw new Error(`no submission ${id}`);
        return row;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { jobs: GradingJob[] }. Every submission starts as "pending". A job that throws is
// reported in "failures" (in production it is retried, then dead-lettered).
const input: { jobs: GradingJob[] } = JSON.parse(readFileSync(0, "utf8"));
const db = new GradingDb();
for (const job of input.jobs) db.rows.set(job.submissionId, { id: job.submissionId, aiScore: null, feedback: null, status: "pending" });
const failures: { submissionId: string; error: string }[] = [];
for (const job of input.jobs) {
    try {
        handleGradingResult(job, db);
    } catch (error) {
        failures.push({ submissionId: job.submissionId, error: (error as Error).message });
    }
}
console.log(JSON.stringify({
    gradebook: [...db.rows.values()].map((r) => ({ id: r.id, aiScore: r.aiScore, status: r.status })),
    reviewQueue: db.reviewQueue,
    decisions: db.decisions,
    failures,
}));
