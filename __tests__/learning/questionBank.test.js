import { describe, expect, it } from "vitest";

import { pickQuestions } from "@/lib/challenges/questionBank";

const questions = Array.from({ length: 12 }, (_, i) => ({ question_id: String(1000 + i) }));
const ids = (list) => list.map((q) => q.question_id);

describe("pickQuestions", () => {
    it("keeps every question in authored order without a display count", () => {
        expect(pickQuestions(questions, { userDbId: "7", count: null })).toBe(questions);
    });

    it("gives a learner the same subset and order on every call, and other learners other ones", () => {
        const first = ids(pickQuestions(questions, { userDbId: "7", count: 5 }));
        expect(first).toHaveLength(5);
        expect(new Set(first).size).toBe(5);
        expect(ids(pickQuestions(questions, { userDbId: "7", count: 5 }))).toEqual(first);
        const others = ["8", "9", "10", "11"].map((u) => ids(pickQuestions(questions, { userDbId: u, count: 5 })).join());
        expect(others.some((o) => o !== first.join())).toBe(true);
        // A larger count extends the same ranking instead of picking a new set.
        expect(ids(pickQuestions(questions, { userDbId: "7", count: 8 })).slice(0, 5)).toEqual(first);
    });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("pickQuestions vs learning_progress_content ranking (PostgreSQL)", () => {
    it("orders like ORDER BY md5(user:question) COLLATE \"C\"", async () => {
        const { sql } = await import("@/lib/db");
        const { rows } = await sql(
            `SELECT q AS question_id FROM unnest($1::text[]) q ORDER BY md5($2 || ':' || q) COLLATE "C" LIMIT 6`,
            [ids(questions), "42"]
        );
        expect(ids(rows)).toEqual(ids(pickQuestions(questions, { userDbId: "42", count: 6 })));
    });
});
