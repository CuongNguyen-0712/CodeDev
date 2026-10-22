import { describe, expect, it } from "vitest";

import { executeTests } from "@/lib/challenges/codeRunner";
import { stdoutMatches } from "@/lib/challenges/compare";

/**
 * The code runner on a real Vercel Sandbox (lib/challenges/vercelRunner.js). Opt-in, it creates
 * (or resumes) the sandbox named by CODE_RUNNER_SANDBOX - use a test name, not production's:
 *
 *   VERCEL_OIDC_TOKEN=... CODE_RUNNER_PROVIDER=vercel CODE_RUNNER_SANDBOX=codedev-runner-test-v2 \
 *     npx vitest run __tests__/sandbox/vercel.integration.test.js
 */
const enabled = process.env.CODE_RUNNER_PROVIDER === "vercel"
    && Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN)
    && /test/.test(process.env.CODE_RUNNER_SANDBOX || "");

const run = (language, code, input = "2 3\n", extra = {}) =>
    executeTests({ language, code, tests: [{ id: "t", input }], timeLimitMs: 2000, memoryLimitMb: 128, ...extra });

describe.skipIf(!enabled)("code runner on Vercel Sandbox", () => {
    const sum = {
        python: "import sys\nprint(sum(map(int, sys.stdin.read().split())))",
        c: '#include <stdio.h>\nint main(void){ int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); }',
        cpp: "#include <iostream>\n#include <print>\nint main(){ int a, b; std::cin >> a >> b; std::println(\"{}\", a + b); }",
        java: "import java.util.Scanner;\npublic class Main { public static void main(String[] args) { var s = new Scanner(System.in); System.out.println(s.nextInt() + s.nextInt()); } }",
        go: 'package main\nimport "fmt"\nfunc main() { var a, b int; fmt.Scan(&a, &b); fmt.Println(a + b) }',
        rust: "use std::io::Read;\nfn main() { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).unwrap(); let n: i64 = s.split_whitespace().map(|x| x.parse::<i64>().unwrap()).sum(); println!(\"{n}\"); }",
        php: "<?php\n[$a, $b] = array_map('intval', preg_split('/\\s+/', trim(stream_get_contents(STDIN))));\necho $a + $b, \"\\n\";",
        typescript: "const [a, b]: number[] = require(\"node:fs\").readFileSync(0, \"utf8\").trim().split(/\\s+/).map(Number);\nconsole.log(a + b);",
        kotlin: "fun main() { val (a, b) = readln().trim().split(\" \").map { it.toInt() }; println(a + b) }",
        csharp: "var p = Console.ReadLine()!.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray();\nConsole.WriteLine(p[0] + p[1]);",
    };

    for (const [language, code] of Object.entries(sum)) {
        it(`${language}: compiles and runs in the sandbox`, async () => {
            const { t } = await run(language, code);
            expect(t).toMatchObject({ error: null, timedOut: false });
            expect(stdoutMatches(t.output, JSON.stringify(5))).toBe(true);
        }, 180_000);
    }

    it("javascript: harness contract (function mode)", async () => {
        const { t } = await run("javascript", "function add(a, b) { return a + b; }", { a: 2, b: 3 }, { entry: "add" });
        expect(t).toMatchObject({ error: null, output: 5 });
    }, 180_000);

    it("reports compile errors and stops infinite loops", async () => {
        const { t: compile } = await run("c", "int main(void) { return missing; }");
        expect(compile.error).toMatch(/^Compilation failed:[\s\S]*missing/);
        const { t: loop } = await run("python", "while True:\n    pass\n");
        expect(loop).toMatchObject({ timedOut: true, output: null });
    }, 180_000);
});
