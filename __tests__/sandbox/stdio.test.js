import path from "node:path";
import { loadEnv } from "vite";
import { describe, expect, it } from "vitest";

import { stdoutMatches, stdoutValue } from "@/lib/challenges/compare";
import { executeTests } from "@/lib/challenges/codeRunner";

// Expected outputs are stored as JSON text (content/tools/build-seed.mjs: json(test.expected)).
const stored = (value) => JSON.stringify(value);

describe("stdio grading (every language except javascript)", () => {
    it("ignores line endings and trailing whitespace", () => {
        expect(stdoutMatches("a b  \r\nc\r\n\r\n", stored("a b\nc"))).toBe(true);
        expect(stdoutMatches("a  b\n", stored("a b"))).toBe(false);
    });

    it("compares JSON output as JSON, whatever the spacing", () => {
        expect(stdoutMatches('{"sum": 6, "xs": [1, 2]}\n', stored({ xs: [1, 2], sum: 6 }))).toBe(true);
        expect(stdoutMatches('{"sum": 7}\n', stored({ sum: 6 }))).toBe(false);
    });

    it("treats a number written as text or as a value alike", () => {
        expect(stdoutMatches("7\n", stored(7))).toBe(true);
        expect(stdoutMatches("7\n", stored("7"))).toBe(true);
        expect(stdoutMatches("007\n", stored("007"))).toBe(true);
        expect(stdoutMatches("7.0\n", stored(7))).toBe(true);
        expect(stdoutMatches("", stored(""))).toBe(true);
    });

    it("shows stdout as a value", () => {
        expect(stdoutValue("[1, 2]\n")).toEqual([1, 2]);
        expect(stdoutValue("hello \n")).toBe("hello");
        expect(stdoutValue(null)).toBeNull();
    });
});

// The codedev_sandbox container (npm run services:up) with CODE_RUNNER_URL/TOKEN in .env.local.
const env = loadEnv("development", path.resolve(__dirname, "..", ".."), "CODE_RUNNER_");
const health = env.CODE_RUNNER_URL
    ? await fetch(new URL("/health", env.CODE_RUNNER_URL)).then((r) => r.json()).catch(() => null)
    : null;
const multiLanguage = Boolean(health?.languages?.includes("rust") && env.CODE_RUNNER_TOKEN);

describe.skipIf(!multiLanguage)("code runner: every language (codedev_sandbox container)", () => {
    const sum = {
        python: "import sys\nprint(sum(map(int, sys.stdin.read().split())))",
        c: '#include <stdio.h>\nint main(void){ int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); }',
        cpp: "#include <iostream>\n#include <print>\nint main(){ int a, b; std::cin >> a >> b; std::println(\"{}\", a + b); }",
        java: "import java.util.Scanner;\npublic class Main { public static void main(String[] args) { var s = new Scanner(System.in); System.out.println(s.nextInt() + s.nextInt()); } }",
        go: 'package main\nimport "fmt"\nfunc main() { var a, b int; fmt.Scan(&a, &b); fmt.Println(a + b) }',
        rust: "use std::io::Read;\nfn main() { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).unwrap(); let n: i64 = s.split_whitespace().map(|x| x.parse::<i64>().unwrap()).sum(); println!(\"{n}\"); }",
    };

    const run = (language, code, input = "2 3\n") => {
        process.env.CODE_RUNNER_URL = env.CODE_RUNNER_URL;
        process.env.CODE_RUNNER_TOKEN = env.CODE_RUNNER_TOKEN;
        return executeTests({ language, code, tests: [{ id: "t", input }], timeLimitMs: 2000, memoryLimitMb: 128 });
    };

    for (const [language, code] of Object.entries(sum)) {
        it(`${language}: compiles, reads stdin, writes stdout`, async () => {
            const { t } = await run(language, code);
            expect(t).toMatchObject({ error: null, timedOut: false });
            expect(stdoutMatches(t.output, stored(5))).toBe(true);
        }, 60_000);
    }

    it("reports a compile error on the test, with the compiler's message", async () => {
        const { t } = await run("c", "int main(void) { return missing; }");
        expect(t.output).toBeNull();
        expect(t.error).toMatch(/^Compilation failed:[\s\S]*missing/);
    }, 60_000);

    it("stops a program at the time limit", async () => {
        const { t } = await run("python", "while True:\n    pass\n");
        expect(t).toMatchObject({ timedOut: true, output: null });
    }, 60_000);
});
