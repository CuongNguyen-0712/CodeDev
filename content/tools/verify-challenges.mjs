#!/usr/bin/env node
/**
 * Verifies the coding challenges of a lesson folder before they are published:
 *   - starter.<ext> must FAIL at least one test (otherwise there is nothing to do)
 *   - solution.<ext> must PASS every test, hidden ones included
 *   - every variants/*.<ext> (known wrong answers) must FAIL at least one test
 *
 * javascript is assembled the same way the browser worker does it (lib/challenges/runner.js):
 * user code + harness in one Function scope, entry = first function in starter.js.
 * Other languages (python, c, cpp, java, go, rust, php, typescript, kotlin, csharp) run in the code runner, exactly as they are
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
const { toRunnableCode } = await import(pathToFileURL(path.join(root, "lib", "challenges", "languages.js")).href);
const { restore, stripMarkers } = await import(pathToFileURL(path.join(root, "lib", "challenges", "pieces.js")).href);
const { generatePieces, piecesJson, usesPieces } = await import(pathToFileURL(path.join(root, "content", "tools", "build-pieces.mjs")).href);
const norm = (text) => String(text ?? "").replace(/\r\n/g, "\n");

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
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${timeLimitMs}ms`)), timeLimitMs); });
    try {
        // A syntax error or a synchronous throw is this variant's result, not a crash of the tool.
        // shortcut: a synchronous endless loop still hangs the tool (in-process), move to a worker if one shows up.
        const factory = new Function(
            `${code}\n;\n${harness || ""}\n;\nreturn { harness: typeof __harness === "function" ? __harness : null, entry: typeof ${entry} !== "undefined" ? ${entry} : null };`
        );
        const exported = factory();
        const run = exported.harness ? exported.harness(input, {}) : exported.entry(input);
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
    // Shared values (.env) under the env file above, the order Next.js uses.
    require("dotenv").config({ path: path.join(root, ".env"), quiet: true, processEnv: env });
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
        return { test, passed, got: r?.ok ? JSON.stringify(r.output) : `ERROR ${r?.timedOut ? "timed out: " : ""}${String(r?.error || "no result").slice(0, 300)}` };
    });
}

// A wrong piece must be caught by what the code does, not by the code failing to build or run: a
// piece that only breaks compilation (or names something undefined) gives itself away. A timeout is a
// real symptom (a deadlock, a missing await) for a wrong piece; only a starter must not hang.
const BROKEN_RE = /Compilation failed|SyntaxError(?!: Invalid regular expression)|IndentationError|TabError|NameError|ReferenceError|is not defined/i;
const TIMEOUT_RE = /timed out|time limit/i;

/** Why a variant that should fail does not count, or null. */
function weakFailure(label, outcomes) {
    const failing = outcomes.filter((o) => !o.passed);
    if (label === "starter" && failing.some((o) => TIMEOUT_RE.test(o.got))) return "the starter hangs (a test timed out): keep loops inside the pieces";
    if (!/^(distractor|bug left):/.test(label) || !failing.length) return null;
    if (failing.every((o) => BROKEN_RE.test(o.got))) return `fails only because it does not build or run (${failing[0].got.slice(6, 120).replace(/\s+/g, " ")}): a test must catch what it does`;
    return null;
}

let failures = 0;
for (const challenge of challenges.filter((c) => c.type !== "quiz")) {
    const language = challengeLanguage(challenge);
    const { ext } = LANGUAGES[language];
    const dir = path.join(lessonDir, "challenges", challenge.publicId);
    const read = (file) => (fs.existsSync(path.join(dir, file)) ? fs.readFileSync(path.join(dir, file), "utf8") : null);
    const starter = read(`starter.${ext}`);
    const { browser, config } = LANGUAGES[language];
    const harness = browser ? read("harness.js") : null;
    // Config files: the text is `__source` for the harness, no entry function.
    const entry = browser && !config ? detectEntryName(starter) : null;
    const timeLimitMs = challenge.coding?.timeLimitMs || 2000;
    const memoryLimitMb = challenge.coding?.memoryLimitMb || 128;

    const variants = [["starter", starter, "fail"], ["solution", read(`solution.${ext}`), "pass"]];

    // Piece-assembly challenge: the generated files are current, the pieces rebuild the solution,
    // the assembled code passes, and every distractor in place of its real piece fails.
    if (usesPieces(dir, ext)) {
        const gen = generatePieces(dir, language);
        const problems = [...gen.errors];
        const solution = stripMarkers(read(`solution.${ext}`));
        if (norm(starter) !== gen.starter) problems.push(`starter.${ext} is stale: run build-pieces.mjs`);
        if (read("pieces.json") === null || norm(read("pieces.json")) !== piecesJson(gen.pieces)) problems.push("pieces.json is stale: run build-pieces.mjs");
        if (challenge.coding?.snippets) problems.push("coding.snippets and pieces.json: keep one");
        // Only browser javascript runs an entry function (the first one in the learner's file: the base
        // with placeholders, or the faulty program in fix mode); stdio languages run their test runner.
        if (!problems.length && browser && !config && detectEntryName(gen.fix ? gen.starter : gen.base) !== detectEntryName(solution)) {
            problems.push("the entry function must stay outside the pieces");
        }
        if (!problems.length && restore(gen.base, gen.real) !== solution) problems.push("base + pieces does not rebuild the solution");
        for (const p of problems) {
            console.log(`\n${challenge.publicId}\n  BAD  ${p}`);
            failures++;
        }
        if (problems.length) continue;
        variants[1] = ["assembled (base + pieces)", restore(gen.base, gen.real), "pass"];
        for (const d of gen.distractors) {
            const swapped = gen.real.map((p) => (p.id === d.for ? { ...p, code: d.code } : p));
            variants.push([`distractor:${d.id}`, restore(gen.base, swapped), "fail"]);
        }
        // Fix-bug mode: every bug must matter on its own (all other blocks fixed, this one left).
        for (const b of gen.bugs) {
            if (gen.bugs.length < 2) break; // the starter already is this variant
            const swapped = gen.real.map((p) => (p.id === b.id ? { ...p, code: b.code } : p));
            variants.push([`bug left:${b.id}`, restore(gen.base, swapped), "fail"]);
        }
    }
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
        const outcomes = browser
            ? await runJavascript({ code: toRunnableCode(language, code), harness, entry, tests: challenge.tests, timeLimitMs })
            : await runStdio({ language, code, tests: challenge.tests, timeLimitMs, memoryLimitMb });
        const passedCount = outcomes.filter((o) => o.passed).length;
        const allPassed = passedCount === outcomes.length;
        const asExpected = expectation === "pass" ? allPassed : !allPassed;
        if (!asExpected) failures++;
        console.log(`  ${asExpected ? "ok  " : "BAD "} ${label.padEnd(28)} ${passedCount}/${outcomes.length} passed (expected to ${expectation})`);
        const weak = asExpected && expectation === "fail" ? weakFailure(label, outcomes) : null;
        // A "bug left" that only breaks the build is a fix spread over dependent blocks: the build error
        // points the learner at the other block, so it is a note. A wrong piece that only breaks the
        // build gives itself away, and a hanging starter wastes the runner: those fail the check.
        if (weak && label.startsWith("bug left:")) console.log(`  note ${label}: ${weak}`);
        else if (weak) {
            failures++;
            console.log(`  BAD  ${label}: ${weak}`);
        }
        for (const o of outcomes.filter((x) => !x.passed && expectation === "pass")) {
            console.log(`         - ${o.test.name}: got ${o.got}`);
        }
    }
}

console.log(failures === 0 ? "\nAll challenge checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
