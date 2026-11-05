import { describe, expect, it } from "vitest";

import { commentToken, findPlaceholder, parseDistractor, parsePieces, replacePlaceholder, restore, stripMarkers } from "@/lib/challenges/pieces";
import { dealPieces } from "@/lib/challenges/questionBank";

const JS = `// Rice Rocket config
function loadConfig(env) {
  const errors = [];
  // @piece read-port: Read PORT
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port)) {
    errors.push("PORT");
  }
  // @end
  // @piece result: Return the config
  return { port, errors };
  // @end
}
`;

const DOCKER = `FROM node:24-slim AS build
WORKDIR /app
# @piece install: Install dependencies
COPY package.json package-lock.json ./
RUN npm ci
# @end
CMD ["node", "dist/server.js"]
`;

describe("parsePieces", () => {
    it("cuts the marked blocks out and leaves one placeholder at the marker indent", () => {
        const { base, pieces, errors } = parsePieces(JS, "//");
        expect(errors).toEqual([]);
        expect(base).toBe("// Rice Rocket config\nfunction loadConfig(env) {\n  const errors = [];\n  // [ ] Read PORT\n  // [ ] Return the config\n}\n");
        expect(pieces.map((p) => [p.id, p.label, p.indent])).toEqual([["read-port", "Read PORT", "  "], ["result", "Return the config", "  "]]);
        expect(pieces[0].code).toBe("const port = Number(env.PORT ?? 3000);\nif (!Number.isInteger(port)) {\n  errors.push(\"PORT\");\n}");
    });

    it("round-trips: base + every piece in its placeholder is the solution", () => {
        for (const [source, token] of [[JS, "//"], [DOCKER, "#"], [JS.replace(/\n/g, "\r\n"), "//"]]) {
            const { base, pieces } = parsePieces(source, token);
            expect(restore(base, pieces)).toBe(stripMarkers(source));
            expect(stripMarkers(source)).not.toMatch(/@piece|@end/);
        }
    });

    it("reports authoring mistakes", () => {
        const errorsOf = (source) => parsePieces(source, "//").errors.join("\n");
        expect(errorsOf("// @piece a: A\n// @piece b: B\nx\n// @end\n// @end")).toMatch(/cannot nest/);
        expect(errorsOf("// @piece a: A\nx")).toMatch(/no @end/);
        expect(errorsOf("x\n// @end")).toMatch(/@end without @piece/);
        expect(errorsOf("// @piece Bad_Id: A\nx\n// @end")).toMatch(/kebab-case/);
        expect(errorsOf(`// @piece a: ${"x".repeat(61)}\nx\n// @end`)).toMatch(/label of 1-60/);
        expect(errorsOf("// @piece a: A\nx\n// @end\n// @piece a: B\ny\n// @end")).toMatch(/duplicate piece id/);
        expect(errorsOf("// @piece a: A\nx\n// @end\n// @piece b: A\ny\n// @end")).toMatch(/duplicate piece label/);
        expect(errorsOf("  // @piece a: A\nx\n  // @end")).toMatch(/indented less/);
        expect(errorsOf("// @piece a: A\n\nx\n// @end")).toMatch(/blank line/);
        expect(errorsOf("# @piece a: A\nx\n# @end")).toMatch(/use "\/\/"/);
    });
});

describe("parseDistractor", () => {
    it("reads the sibling id, the label and the dedented code", () => {
        expect(parseDistractor("// @piece read-port: Read PORT\n  const port = parseInt(env.PORT);\n", "//"))
            .toEqual({ for: "read-port", label: "Read PORT", code: "const port = parseInt(env.PORT);" });
        expect(parseDistractor("const x = 1;", "//").error).toMatch(/first line/);
    });
});

describe("placeholders", () => {
    it("replaces the placeholder line at its indent and puts the caret after the piece", () => {
        const base = parsePieces(JS, "//").base;
        const slot = findPlaceholder(base, "Read PORT");
        const { text, caret } = replacePlaceholder(base, slot, "const port = 80;\nlog(port);");
        expect(text).toContain("  const errors = [];\n  const port = 80;\n  log(port);\n  // [ ] Return the config");
        expect(text.slice(0, caret).endsWith("log(port);")).toBe(true);
        expect(findPlaceholder(base, "Missing")).toBeNull();
    });

    it("picks the comment token per language", () => {
        expect(commentToken("dockerfile")).toBe("#");
        expect(commentToken("yaml")).toBe("#");
        expect(commentToken("hcl")).toBe("#");
        expect(commentToken("javascript")).toBe("//");
    });
});

describe("dealPieces", () => {
    const pieces = ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id, code: id, ...(id === "e" ? { distractor: true } : {}) }));

    it("keeps every piece, drops the distractor flag and is stable per learner", () => {
        const one = dealPieces(pieces, { userDbId: "7", challengeId: "42" });
        expect(one).toHaveLength(5);
        expect(one.some((p) => "distractor" in p)).toBe(false);
        expect(dealPieces(pieces, { userDbId: "7", challengeId: "42" })).toEqual(one);
    });

    it("orders differently across learners", () => {
        const orders = new Set(["1", "2", "3", "4", "5", "6"].map((u) => dealPieces(pieces, { userDbId: u, challengeId: "42" }).map((p) => p.id).join("")));
        expect(orders.size).toBeGreaterThan(1);
    });
});
