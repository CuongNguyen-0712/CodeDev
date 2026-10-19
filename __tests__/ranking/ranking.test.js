import { describe, expect, it } from "vitest";

import { parseRankingQuery, periodSince, rankUps, toStanding } from "@/lib/ranking";

describe("parseRankingQuery", () => {
    it("keeps known values and falls back for unknown ones", () => {
        expect(parseRankingQuery(new URLSearchParams("board=exp&period=30d"))).toEqual({ board: "exp", period: "30d" });
        expect(parseRankingQuery(new URLSearchParams("board=drop%20table&period=year"))).toEqual({ board: "overall", period: "all" });
        expect(parseRankingQuery({ board: "points" })).toEqual({ board: "points", period: "all" });
        expect(parseRankingQuery(null)).toEqual({ board: "overall", period: "all" });
    });
});

describe("rankUps", () => {
    const ranks = (overall, exp, points) => ({
        overall: { tier: overall, title: `O${overall}` },
        exp: { tier: exp, title: `E${exp}` },
        points: { tier: points, title: `P${points}` },
    });

    it("lists only the boards whose tier went up", () => {
        expect(rankUps(ranks(1, 2, 1), ranks(2, 2, 3))).toEqual([
            { board: "overall", title: "O2" },
            { board: "points", title: "P3" },
        ]);
        expect(rankUps(ranks(2, 2, 2), ranks(2, 2, 2))).toEqual([]);
    });

    it("needs both snapshots (no toast on the first load)", () => {
        expect(rankUps(null, ranks(3, 3, 3))).toEqual([]);
        expect(rankUps({ overall: null }, ranks(3, 1, 1))).toEqual([]);
    });
});

describe("periodSince", () => {
    it("is null for all time and 30 days back otherwise", () => {
        const now = new Date("2026-10-19T12:00:00Z");
        expect(periodSince("all", now)).toBeNull();
        expect(periodSince("30d", now)).toBe("2026-09-19T12:00:00.000Z");
    });
});

describe("toStanding", () => {
    it("computes the gap and progress to the next tier from the all-time score", () => {
        const s = toStanding({
            position: "4", score: "120", visible: true, tier: 2, tier_title: "Foundation",
            tier_min_score: "450", next_title: "Developer", next_min_score: "1900", all_score: "1175",
            public_id: "p1", username: "ann", nickname: "None", image: null,
        });
        expect(s).toMatchObject({ position: 4, score: 120, tier: 2, title: "Foundation", toNext: 725, percent: 50 });
        expect(s.next).toEqual({ title: "Developer", minScore: 1900 });
        expect(s.user).toEqual({ id: "p1", username: "ann", nickname: null, image: null });
    });

    it("reports the top tier and an unranked learner", () => {
        const top = toStanding({ position: null, score: "0", visible: false, tier: 6, tier_title: "Legend", tier_min_score: "18000", next_min_score: null, all_score: "20000" });
        expect(top).toMatchObject({ position: null, visible: false, next: null, toNext: 0, percent: 100 });
        expect(toStanding(undefined)).toBeNull();
    });
});
