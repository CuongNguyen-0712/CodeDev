import { describe, expect, it } from "vitest";

import { addTags } from "@/lib/blog/tags.mjs";

describe("addTags (editor tag input)", () => {
    it("adds every comma-separated part, normalized and without duplicates", () => {
        expect(addTags(["sql"], "sql,Postgres , React Hooks".split(","), 5)).toEqual({ tags: ["sql", "postgres", "react-hooks"], invalid: [] });
    });
    it("skips empty parts", () => expect(addTags([], ["", "  "], 5)).toEqual({ tags: [], invalid: [] }));
    it("reports parts that break the tag pattern", () => {
        expect(addTags([], ["c#", "ok", "a".repeat(31)], 5)).toEqual({ tags: ["ok"], invalid: ["c#", "a".repeat(31)] });
    });
    it("stops at the maximum", () => expect(addTags(["a", "b"], ["c", "d"], 3).tags).toEqual(["a", "b", "c"]));
});
