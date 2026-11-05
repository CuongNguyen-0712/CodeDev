import { describe, expect, it } from "vitest";

import { gradeTests } from "@/lib/challenges/grading";
import { isBrowserLanguage, isConfigLanguage, runnerLanguage, toRunnableCode } from "@/lib/challenges/languages";

// Same assembly as the browser worker (lib/challenges/runner.js): code + harness in one scope.
async function run(language, source, harness, input) {
    const factory = new Function(`${toRunnableCode(language, source)}\n;\n${harness}\n;\nreturn __harness;`);
    return factory()(input, {});
}

describe("config-file challenges", () => {
    it("are browser languages that run as javascript", () => {
        expect(isConfigLanguage("dockerfile")).toBe(true);
        expect(isBrowserLanguage("nginx")).toBe(true);
        expect(isConfigLanguage("hcl")).toBe(true);
        expect(runnerLanguage("hcl")).toBe("javascript");
        expect(isBrowserLanguage("python")).toBe(false);
        expect(runnerLanguage("yaml")).toBe("javascript");
        expect(runnerLanguage("go")).toBe("go");
        expect(toRunnableCode("javascript", "f()")).toBe("f()");
    });

    it("hand the file text to the harness as __source, quotes and backticks included", async () => {
        const dockerfile = "FROM node:24-slim AS build\nRUN echo \"`hi`\" ${X}\nCMD [\"node\", \"server.js\"]\n";
        const harness = `async function __harness() {
            return __source.split("\\n").filter(Boolean).map((line) => line.split(" ")[0]);
        }`;
        expect(await run("dockerfile", dockerfile, harness, {})).toEqual(["FROM", "RUN", "CMD"]);
    });

    it("are graded on the harness value, not on stdout", () => {
        const [graded] = gradeTests(
            [{ id: "1", name: "plan", expected: '{"stages":2}', score: 1, isHidden: false }],
            { 1: { output: { stages: 2 }, error: null, timeMs: 3 } },
            "dockerfile"
        );
        expect(graded.status).toBe("passed");
    });
});
