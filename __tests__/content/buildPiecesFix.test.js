import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generatePieces } from "@/content/tools/build-pieces.mjs";
import { restore } from "@/lib/challenges/pieces";

const SOLUTION = `function total(items) {
  let sum = 0;
  // @piece add-prices: Add up the prices
  for (const item of items) {
    sum += item.price * item.qty;
  }
  // @end
  // @piece round-total: Round to whole dong
  return Math.round(sum);
  // @end
}
`;

let dir;
const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
};

afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

describe("build-pieces fix-bug mode (bugs/)", () => {
    it("makes the starter the faulty program, with no placeholders", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pieces-fix-"));
        write("solution.js", SOLUTION);
        write("bugs/add-prices.js", "// @piece add-prices: Add up the prices\nfor (let i = 1; i < items.length; i++) {\n  sum += items[i].price;\n}\n");
        write("bugs/round-total.js", "// @piece round-total: Round to whole dong\nreturn Math.floor(sum);\n");
        write("distractors/round-total-fixed.js", "// @piece round-total: Round to whole dong\nreturn sum.toFixed(0);\n");

        const gen = generatePieces(dir, "javascript");
        expect(gen.errors).toEqual([]);
        expect(gen.fix).toBe(true);
        expect(gen.starter).not.toMatch(/\[ \]/);
        expect(gen.starter).toContain("for (let i = 1; i < items.length; i++) {\n    sum += items[i].price;\n  }");
        expect(gen.starter).toContain("  return Math.floor(sum);");
        // The fixes rebuild the solution from the base, as in build mode.
        expect(restore(gen.base, gen.real)).toBe(SOLUTION.replace(/^ *\/\/ @(piece .*|end)\n/gm, ""));
        expect(gen.pieces.map((p) => p.id)).toEqual(["add-prices", "round-total", "round-total-fixed"]);
    });

    it("needs a bug for every piece, named after it, different from the fix", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pieces-fix-"));
        write("solution.js", SOLUTION);
        write("bugs/add-prices.js", "// @piece add-prices: Add up the prices\nfor (const item of items) {\n  sum += item.price * item.qty;\n}\n");
        write("bugs/other.js", "// @piece round-total: Round to whole dong\nreturn Math.floor(sum);\n");
        const errors = generatePieces(dir, "javascript").errors.join("\n");
        expect(errors).toMatch(/bugs\/add-prices\.js: same code as the fix/);
        expect(errors).toMatch(/bugs\/other\.js: name the file after its piece \(round-total\.js\)/);
    });
});
