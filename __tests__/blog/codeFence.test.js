import { describe, expect, it } from "vitest";

import { parseCodeFence } from "@/lib/blog/codeFence.mjs";

describe("parseCodeFence", () => {
    it.each([
        ["language-js", undefined, { language: "js", filename: null }],
        ["language-js", "app.js", { language: "js", filename: "app.js" }],
        ["language-js", 'title="src/app.js"', { language: "js", filename: "src/app.js" }],
        ["language-js", "title='app.js'", { language: "js", filename: "app.js" }],
        ["language-js", "title=app.js", { language: "js", filename: "app.js" }],
        ["language-app.py", undefined, { language: "py", filename: "app.py" }],
        ["language-Query.SQL", undefined, { language: "sql", filename: "Query.SQL" }],
        ["language-c++", undefined, { language: "c++", filename: null }],
        [undefined, undefined, { language: null, filename: null }],
        ["language-name", undefined, { language: "name", filename: null }],
    ])("%s %s", (className, meta, expected) => {
        expect(parseCodeFence(className, meta)).toEqual(expected);
    });

    it("drops a file name longer than 80 characters", () => {
        expect(parseCodeFence("language-js", "a".repeat(81) + ".js").filename).toBeNull();
    });
});
