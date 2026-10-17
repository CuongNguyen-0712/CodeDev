#!/usr/bin/env node
/**
 * Verifies the coding challenges of a lesson folder before they are published:
 *   - starter.js must FAIL at least one test (otherwise there is nothing to do)
 *   - solution.js must PASS every test, hidden ones included
 *   - every variants/*.js (known wrong answers) must FAIL at least one test
 *
 * Code is assembled the same way the browser worker does it (lib/challenges/runner.js):
 * user code + harness in one Function scope, entry = first function in starter.js.
 *
 * Usage: node content/tools/verify-challenges.mjs <lesson folder>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { outputsMatch } = await import(pathToFileURL(path.join(root, "lib", "challenges", "compare.js")).href);

const lessonDir = path.resolve(process.argv[2] || ".");
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

let failures = 0;
for (const challenge of challenges.filter((c) => c.type !== "quiz")) {
    const dir = path.join(lessonDir, "challenges", challenge.publicId);
    const read = (file) => (fs.existsSync(path.join(dir, file)) ? fs.readFileSync(path.join(dir, file), "utf8") : null);
    const starter = read("starter.js");
    const harness = read("harness.js");
    const entry = detectEntryName(starter);
    const timeLimitMs = challenge.coding?.timeLimitMs || 2000;

    const variants = [["starter", starter, "fail"], ["solution", read("solution.js"), "pass"]];
    const variantDir = path.join(dir, "variants");
    if (fs.existsSync(variantDir)) {
        for (const file of fs.readdirSync(variantDir).filter((f) => f.endsWith(".js"))) {
            variants.push([`variant:${file}`, fs.readFileSync(path.join(variantDir, file), "utf8"), "fail"]);
        }
    }

    console.log(`\n${challenge.publicId} (entry: ${entry}, ${challenge.tests.length} tests)`);
    for (const [label, code, expectation] of variants) {
        if (!code) {
            console.log(`  MISSING ${label}`);
            failures++;
            continue;
        }
        const outcomes = [];
        for (const test of challenge.tests) {
            const result = await runOne({ code, harness, entry, input: test.input, timeLimitMs });
            const passed = result.ok && outputsMatch(result.output, JSON.stringify(test.expected));
            outcomes.push({ test, passed, got: result.ok ? JSON.stringify(result.output) : `ERROR ${result.error}` });
        }
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
