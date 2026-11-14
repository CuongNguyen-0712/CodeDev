import { json, pick } from "./util.js";

// Lessons already submitted by this VU: a repeat would only be a no-op.
const submitted = {};

// The quiz API reports which answers were right (they get locked); every other question is flipped
// to a different option, so a two-option question is solved on the second attempt.
// Returns null when a question is not single choice (not worth guessing).
function nextAnswers(q) {
    const prev = q.answers || {};
    const answers = {};
    for (const question of q.questions || []) {
        if (question.type !== "single_choice" || !question.options?.length) return null;
        const sel = prev[question.id];
        const right = q.results?.[question.id]?.isCorrect;
        answers[question.id] = sel && right ? sel : (question.options.find((o) => String(o.id) !== String(sel)) || question.options[0]).id;
    }
    return answers;
}

export default function (client, ctx) {
    const c = pick(ctx.courses);
    client.get("/api/user/me", "/api/user/me");
    client.get("/learning", "/learning");
    client.get("/api/user/course-progress", "/api/user/course-progress");
    client.think();
    if (c) {
        const page = `/learning/${c.id}?lesson=${c.lessonId}`;
        client.get(page, "/learning/:id");
        client.get(`/api/course/learning?lessonId=${c.lessonId}`, "/api/course/learning");
        client.get(`/api/user/learning-progress?courseId=${c.id}`, "/api/user/learning-progress");
        client.action("recordLessonVisitAction", page, [{ courseId: c.id, lessonId: c.lessonId }], "recordLessonVisitAction");
        client.think();
        let passed = false;
        if (c.quizId) {
            const q = json(client.get(`/api/challenges/${c.quizId}/quiz`, "/api/challenges/:id/quiz"));
            passed = Boolean(q?.passed);
            const answers = q && q.canSubmit && !q.passed ? nextAnswers(q) : null;
            if (answers) {
                const r = client.action("submitQuizAction", page, [{ challengeId: c.quizId, answers }], "submitQuizAction");
                passed = Boolean(r.action.data?.passed);
            }
        }
        if (c.submittable && passed && !submitted[c.lessonId]) {
            const r = client.action("submitLessonAction", page, [{ courseId: c.id, lessonId: c.lessonId }], "submitLessonAction");
            if (r.action.ok) submitted[c.lessonId] = true;
        }
        if (Math.random() < 0.1) {
            const id = pick(ctx.courseIds);
            client.action("registerCourseAction", `/course/${id}`, [{ courseId: id }], "registerCourseAction");
        }
        client.think();
    }
    client.get("/ranking", "/ranking");
    client.get("/api/ranking?board=overall&period=all", "/api/ranking");
    client.get("/api/ranking/me", "/api/ranking/me");
}
