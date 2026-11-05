import { describe, expect, it } from "vitest";

import { detectEntryName, entryBodyStart } from "@/lib/challenges/entry";

const at = (source) => {
    const index = entryBodyStart(source);
    return index === null ? null : source.slice(index);
};

describe("entryBodyStart", () => {
    it("points at the first body line of a function declaration", () => {
        expect(at("function total(lines) {\n    return 0;\n}\n")).toBe("    return 0;\n}\n");
    });

    it("handles a const arrow function with a block body", () => {
        expect(at("const plan = (input) => {\n  return [];\n};")).toBe("  return [];\n};");
    });

    it("returns null for an expression body", () => {
        expect(entryBodyStart("const double = (x) => x * 2;\nconst o = { a: 1 };")).toBeNull();
    });

    it("ignores the function name inside a leading comment", () => {
        const source = "// Write loadConfig(env) below.\nfunction loadConfig(env) {\n}\n";
        expect(at(source)).toBe("}\n");
        expect(detectEntryName(source)).toBe("loadConfig");
    });

    it("returns null when there is no function", () => {
        expect(entryBodyStart("FROM node:24-slim\n")).toBeNull();
    });

    it("works with CRLF line ends", () => {
        expect(at("function f() {\r\n  x();\r\n}")).toBe("  x();\r\n}");
    });
});
