#!/usr/bin/env node
/**
 * Verifies the coding challenges of a lesson folder before they are published:
 *   - starter.<ext> must FAIL at least one test (otherwise there is nothing to do)
 *   - solution.<ext> must PASS every test, hidden ones included
 *   - every variants/*.<ext> (known wrong answers) must FAIL at least one test
 *
 * javascript is assembled the same way the browser worker does it (lib/challenges/runner.js):
 * user code + harness in one Function scope, entry = first function in starter.js.
 * Other languages (python, c, cpp, java, go, rust) run in the code runner, exactly as they are
 * graded: start it with `npm run services:up` and set CODE_RUNNER_URL / CODE_RUNNER_TOKEN in
 * .env.local (or pass --env <file>).
 *
 * Usage: node content/tools/verify-challenges.mjs <lesson folder> [--env .env.local]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { LANGUAGES, challengeLanguage } from "./languages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { outputsMatch, stdoutMatches } = await import(pathToFileURL(path.join(root, "lib", "challenges", "compare.js")).href);

const args = process.argv.slice(2);
const lessonDir = path.resolve(args[0] || ".");
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const { challenges } = JSON.parse(fs.readFileSync(path.join(lessonDir, "challenges.json"), "utf8"));
globalThis.self = globalThis;

function detectEntryName(source = "") {
    const match = source.match(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/);
    return match ? match[1] : null;
}

async function runOne({ code, harness, entry, input, timeLimitMs }) {
    const factory = new Function(
        `${code}\n;\n${harness || ""}\n;\nreturn { harness: typeof __harness === "function" ? __harness : null, entry: typeof ${entry} !== "undefined" ? ${entry} : null };`
    );
    const exported = factory();
    const run = exported.harness ? exported.harness(input, {}) : exported.entry(input);
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${timeLimitMs}ms`)), timeLimitMs); });
    try {
        return { ok: true, output: await Promise.race([run, timeout]) };
    } catch (error) {
        return { ok: false, error: error.message };
    } finally {
        clearTimeout(timer);
    }
}

/** javascript, in-process: one outcome per test. */
async function runJavascript({ code, harness, entry, tests, timeLimitMs }) {
    const outcomes = [];
    for (const test of tests) {
        const result = await runOne({ code, harness, entry, input: test.input, timeLimitMs });
        const passed = result.ok && outputsMatch(result.output, JSON.stringify(test.expected));
        outcomes.push({ test, passed, got: result.ok ? JSON.stringify(result.output) : `ERROR ${result.error}` });
    }
    return outcomes;
}

let runner = null;
function codeRunner() {
    if (runner) return runner;
    const require = createRequire(path.join(root, "package.json"));
    const env = {};
    require("dotenv").config({ path: path.join(root, envFile), quiet: true, processEnv: env });
    if (!env.CODE_RUNNER_URL || !env.CODE_RUNNER_TOKEN) {
        throw new Error(`CODE_RUNNER_URL and CODE_RUNNER_TOKEN must be set in ${envFile} to verify non-javascript challenges`);
    }
    return (runner = { url: new URL("/v1/execute", env.CODE_RUNNER_URL), token: env.CODE_RUNNER_TOKEN });
}

/** Other languages, in the code runner (one request: compile once, run every test). */
async function runStdio({ language, code, tests, timeLimitMs, memoryLimitMb }) {
    const { url, token } = codeRunner();
    const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
            language, code, timeLimitMs, memoryLimitMb,
            tests: tests.map((t, i) => ({ id: String(i), input: t.input ?? null })),
        }),
    });
    if (!res.ok) throw new Error(`code runner: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const { results } = await res.json();
    return tests.map((test, i) => {
        const r = results[String(i)];
        const passed = Boolean(r?.ok) && stdoutMatches(r.output, JSON.stringify(test.expected));
        return { test, passed, got: r?.ok ? JSON.stringify(r.output) : `ERROR ${String(r?.error || "no result").slice(0, 300)}` };
    });
}

let failures = 0;
for (const challenge of challenges.filter((c) => c.type !== "quiz")) {
    const language = challengeLanguage(challenge);
    const { ext } = LANGUAGES[language];
    const dir = path.join(lessonDir, "challenges", challenge.publicId);
    const read = (file) => (fs.existsSync(path.join(dir, file)) ? fs.readFileSync(path.join(dir, file), "utf8") : null);
    const starter = read(`starter.${ext}`);
    const harness = language === "javascript" ? read("harness.js") : null;
    const entry = language === "javascript" ? detectEntryName(starter) : null;
    const timeLimitMs = challenge.coding?.timeLimitMs || 2000;
    const memoryLimitMb = challenge.coding?.memoryLimitMb || 128;

    const variants = [["starter", starter, "fail"], ["solution", read(`solution.${ext}`), "pass"]];
    const variantDir = path.join(dir, "variants");
    if (fs.existsSync(variantDir)) {
        for (const file of fs.readdirSync(variantDir).filter((f) => f.endsWith(`.${ext}`))) {
            variants.push([`variant:${file}`, fs.readFileSync(path.join(variantDir, file), "utf8"), "fail"]);
        }
    }

    console.log(`\n${challenge.publicId} (${language}${entry ? `, entry: ${entry}` : ""}, ${challenge.tests.length} tests)`);
    for (const [label, code, expectation] of variants) {
        if (!code) {
            console.log(`  MISSING ${label}`);
            failures++;
            continue;
        }
        const outcomes = language === "javascript"
            ? await runJavascript({ code, harness, entry, tests: challenge.tests, timeLimitMs })
            : await runStdio({ language, code, tests: challenge.tests, timeLimitMs, memoryLimitMb });
        const passedCount = outcomes.filter((o) => o.passed).length;
        const allPassed = passedCount === outcomes.length;
        const asExpected = expectation === "pass" ? allPassed : !allPassed;
        if (!asExpected) failures++;
        console.log(`  ${asExpected ? "ok  " : "BAD "} ${label.padEnd(28)} ${passedCount}/${outcomes.length} passed (expected to ${expectation})`);
        for (const o of outcomes.filter((x) => !x.passed && expectation === "pass")) {
            console.log(`         - ${o.test.name}: got ${o.got}`);
        }
    }
}

console.log(failures === 0 ? "\nAll challenge checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
