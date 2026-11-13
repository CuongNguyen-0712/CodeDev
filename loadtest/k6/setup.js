// Shared by main.js and coderun.js: course/lesson/challenge ids are read once from the app's own
// APIs in setup(); the per-VU clients are created lazily because a client owns its cookie jar.
import http from "k6/http";
import { BASE_URL, ORIGIN, actions, sessions } from "./lib/config.js";
import { createClient } from "./lib/client.js";
import { cookieHeader, sessionIndex } from "./lib/pure.js";
import { json } from "./journeys/util.js";

// Peers for friend requests: the minted sessions, so a receiver has a VU that can respond.
const users = sessions.map((s) => s.publicId);

// Only the first unlocked lesson of each course is workable for every seeded user, so the quiz and
// the coding challenge are looked for there. Courses come from the public list; lessons from the
// first session's learning progress.
export function buildData() {
    const s = sessions[0];
    const headers = { "x-forwarded-for": s.ip };
    const courses = json(http.get(`${BASE_URL}/api/course/courses?limit=20`, { headers }))?.data || [];
    const out = { courses: [], coding: [] };
    for (const c of courses) {
        const prog = json(http.get(`${BASE_URL}/api/user/learning-progress?courseId=${c.id}`, {
            headers: { ...headers, Cookie: cookieHeader(s.cookies) }, jar: new http.CookieJar(),
        }));
        const lessons = (prog?.modules || []).flatMap((m) => m.lessons || []);
        const lesson = lessons.find((l) => l.status === "in_progress") || lessons[0];
        if (!lesson) continue;
        const chals = lesson.challenges || [];
        const quiz = chals.find((x) => x.type === "quiz");
        const code = chals.find((x) => x.coding);
        out.courses.push({
            id: c.id,
            lessonId: String(lesson.id),
            quizId: quiz ? String(quiz.id) : null,
            // submitLessonAction is refused until every challenge is passed: only quiz-only lessons qualify.
            submittable: chals.length > 0 && chals.every((x) => x.type === "quiz"),
        });
        if (code) out.coding.push({ courseId: c.id, lessonId: String(lesson.id), challengeId: String(code.id) });
    }
    console.log(`setup: ${out.courses.length} courses, ${out.coding.length} with a coding challenge, ${users.length} users`);
    return out;
}

export const ctxOf = (data) => ({ courseIds: data.courses.map((c) => c.id), courses: data.courses, coding: data.coding, users });

// One client per VU and kind: guests never send the VU's cookies but keep its source IP.
const clients = {};
export const sessionOfVu = () => sessions[sessionIndex(__VU, sessions.length)];
export function clientFor(kind) {
    if (!clients[kind]) {
        const s = sessionOfVu();
        clients[kind] = createClient({
            baseUrl: BASE_URL, origin: ORIGIN, actions,
            session: kind === "guest" ? { ip: s.ip, cookies: {} } : s,
        });
    }
    return clients[kind];
}
