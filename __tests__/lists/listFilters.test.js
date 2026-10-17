import { describe, expect, it } from "vitest";

import {
    parseListQuery, toQueryParams, toQueryString, isFiltered, listCacheIdentity,
    normalizeSearch, escapeLike, defaultFilter, SEARCH_MAX_LENGTH,
} from "@/lib/listFilters";

const qs = (s) => new URLSearchParams(s);

describe("list filters: parsing", () => {
    it("reads the canonical URL, axios array style and repeated keys alike", () => {
        const expected = { level: ["beginner", "advanced"], price: [], rating: [], language: [], category: [], role: [], industry: [], skill: [] };
        expect(parseListQuery("course", qs("level=advanced,beginner")).filter).toEqual(expected);
        expect(parseListQuery("course", qs("level[]=beginner&level[]=advanced")).filter).toEqual(expected);
        expect(parseListQuery("course", qs("level=beginner&level=advanced")).filter).toEqual(expected);
        expect(parseListQuery("course", { level: ["advanced", "beginner"] }).filter).toEqual(expected);
    });

    it("drops values the database would reject", () => {
        const { filter } = parseListQuery("course", qs("level=beginner,godlike&price=gratis&rating=9&language=1,abc,-2,0,3&category=99999999999&role=backend_developer,DROP%20TABLE&skill=a'b,nodejs"));
        expect(filter).toEqual({
            level: ["beginner"], price: [], rating: [], language: ["1", "3"], category: [],
            role: ["backend_developer"], industry: [], skill: ["nodejs"],
        });
        // "dropped" was offered by the old UI but is not in status_course_enum.
        expect(parseListQuery("learning", qs("status=dropped,paused")).filter.status).toEqual(["paused"]);
    });

    it("keeps single-choice fields single", () => {
        expect(parseListQuery("course", qs("price=paid,free&rating=4,2")).filter).toMatchObject({ price: ["free"], rating: ["2"] });
    });

    it("applies the learning status default and supports status=all", () => {
        expect(parseListQuery("learning", qs("")).filter.status).toEqual(["enrolled", "in_progress"]);
        expect(parseListQuery("learning", qs("status=all")).filter.status).toEqual([]);
        expect(toQueryParams("learning", { filter: defaultFilter("learning") })).toEqual({});
        expect(toQueryParams("learning", { filter: { status: [] } })).toEqual({ status: "all" });
        expect(isFiltered("learning", { filter: defaultFilter("learning") })).toBe(false);
    });

    it("normalises the search term (q or search)", () => {
        expect(parseListQuery("roadmap", qs("q=%20%20Front%20%20end%20")).search).toBe("Front end");
        expect(parseListQuery("roadmap", qs("search=react")).search).toBe("react");
        expect(normalizeSearch("x".repeat(500))).toHaveLength(SEARCH_MAX_LENGTH);
        expect(normalizeSearch("ｒｅａｃｔ\u0000")).toBe("react");
    });
});

describe("list filters: serialisation and cache identity", () => {
    it("round-trips through the URL in canonical order", () => {
        const state = { search: "Node", filter: { level: ["master", "beginner"], rating: ["4"], language: ["12", "3"] } };
        const query = toQueryString("course", state);
        expect(query).toBe("q=Node&level=beginner%2Cmaster&rating=4&language=3%2C12");
        const parsed = parseListQuery("course", qs(query));
        expect(toQueryString("course", parsed)).toBe(query);
    });

    it("gives equal queries one cache identity, case-insensitive on the search term", () => {
        const a = listCacheIdentity("course", { search: "React  Hooks", filter: { level: ["advanced", "beginner"] } });
        const b = listCacheIdentity("course", { search: "react hooks", filter: { level: ["beginner", "advanced"] } });
        expect(a).toBe(b);
        expect(listCacheIdentity("course", { search: "react" }, { lastId: "x" })).not.toBe(listCacheIdentity("course", { search: "react" }));
    });

    it("escapes LIKE wildcards", () => {
        const bs = "\\";
        expect(escapeLike(`100%_a${bs}b`)).toBe(`100${bs}%${bs}_a${bs}${bs}b`);
    });
});
