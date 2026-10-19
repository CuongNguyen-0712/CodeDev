import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { executeTests } from "@/lib/challenges/codeRunner";

// Runs the real code runner (sandbox/server.mjs) on the host. In Docker the container adds
// read-only root, no capabilities and no network on top; these tests cover the process layer.
const root = path.resolve(__dirname, "..", "..");
const TOKEN = "test-runner-token-0123456789";

function freePort() {
    return new Promise((resolve) => {
        const srv = net.createServer().listen(0, () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

async function startServer(env = {}) {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(root, "sandbox", "server.mjs")], {
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, CODE_RUNNER_TOKEN: TOKEN, PORT: String(port), ...env },
        stdio: "ignore",
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
        try {
            if ((await fetch(`${url}/health`)).ok) return { url, child };
        } catch { /* not listening yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    child.kill();
    throw new Error("code runner did not start");
}

const post = (url, body, token = TOKEN) => fetch(`${url}/v1/execute`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ language: "javascript", timeLimitMs: 1000, memoryLimitMb: 64, ...body }),
});

async function runOne(url, code, input = { n: 2 }) {
    const res = await post(url, { code, entry: "solve", tests: [{ id: "t", input }] });
    expect(res.status).toBe(200);
    return (await res.json()).results.t;
}

let server;
beforeAll(async () => { server = await startServer(); });
afterAll(() => { server?.child.kill(); });

describe("code runner: real challenge", () => {
    const lesson = path.join(root, "content/courses/nodejs-high-performance/01-race-condition-distributed-lock");
    const challenge = JSON.parse(fs.readFileSync(path.join(lesson, "challenges.json"), "utf8"))
        .challenges.find((c) => c.publicId === "chal_coding_nhp_104");
    const read = (file) => fs.readFileSync(path.join(lesson, "challenges", challenge.publicId, file), "utf8");
    const tests = challenge.tests.map((t, i) => ({ id: `t${i}`, input: t.input, expected: t.expected }));

    it("solution passes and starter fails every test (same harness contract as the browser)", async () => {
        for (const [file, shouldPass] of [["solution.js", true], ["starter.js", false]]) {
            const res = await post(server.url, { code: read(file), harness: read("harness.js"), entry: "createLock", tests });
            const { results } = await res.json();
            for (const t of tests) {
                expect(JSON.stringify(results[t.id].output) === JSON.stringify(t.expected)).toBe(shouldPass);
            }
        }
    });

    it("executeTests (app client) returns the browser report shape", async () => {
        process.env.CODE_RUNNER_URL = server.url;
        process.env.CODE_RUNNER_TOKEN = TOKEN;
        const results = await executeTests({ code: read("solution.js"), harness: read("harness.js"), entry: "createLock", tests, timeLimitMs: 2000, memoryLimitMb: 128 });
        expect(Object.keys(results)).toEqual(tests.map((t) => t.id));
        expect(results.t0).toMatchObject({ error: null, timedOut: false, output: tests[0].expected });
    });
});

describe("code runner: isolation", () => {
    it("stops infinite loops at the time limit", async () => {
        const r = await runOne(server.url, "function solve(){ while(true){} }");
        expect(r).toMatchObject({ ok: false, timedOut: true });
    }, 15_000);

    it("stops memory exhaustion", async () => {
        const r = await runOne(server.url, "function solve(){ const a=[]; while(true) a.push(new Array(1e6).fill(1)); }");
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Memory limit|without a result/);
    }, 15_000);

    it("denies file system, child processes and worker threads", async () => {
        const attempts = [
            "return process.getBuiltinModule('fs').readFileSync('package.json','utf8')",
            "process.getBuiltinModule('fs').writeFileSync('pwned.txt','x'); return 1",
            "return String(process.getBuiltinModule('child_process').execSync('whoami'))",
            "new (process.getBuiltinModule('worker_threads').Worker)('1', { eval: true }); return 1",
        ];
        for (const body of attempts) {
            const r = await runOne(server.url, `function solve(){ ${body} }`);
            expect(r.ok, body).toBe(false);
            expect(r.error).toMatch(/restricted|ERR_ACCESS_DENIED/);
        }
        expect(fs.existsSync(path.join(root, "pwned.txt"))).toBe(false);
    });

    it("gives user code no environment and no way to signal other processes", async () => {
        expect((await runOne(server.url, "function solve(){ return Object.keys(process.env).length }")).output).toBe(0);
        const kill = await runOne(server.url, "function solve(){ try { process.kill(process.ppid, 'SIGKILL'); return 'killed' } catch (e) { return 'blocked' } }");
        expect(kill.output).toBe("blocked");
        expect((await fetch(`${server.url}/health`)).ok).toBe(true);
    });

    it("ignores results forged by user code", async () => {
        const r = await runOne(server.url, "function solve(){ process.getBuiltinModule('fs').writeSync(3, '{\"ok\":true,\"output\":\"FAKE\"}\\n'); return 'real' }");
        expect(r.output).toBe("real");
    });

    it("finishes when user code leaves timers running", async () => {
        const r = await runOne(server.url, "function solve(){ setInterval(() => {}, 5); return 'done' }");
        expect(r).toMatchObject({ ok: true, output: "done" });
    });
});

describe("code runner: API", () => {
    it("requires the token", async () => {
        expect((await post(server.url, { code: "1", tests: [{ id: "t" }] }, "wrong-token-wrong-token")).status).toBe(401);
    });

    it("stays up but refuses to run anything without a configured token", async () => {
        const unconfigured = await startServer({ CODE_RUNNER_TOKEN: "" });
        try {
            expect(await (await fetch(`${unconfigured.url}/health`)).json()).toMatchObject({ status: "unconfigured" });
            expect((await post(unconfigured.url, { code: "function solve(){}", entry: "solve", tests: [{ id: "t" }] }, "")).status).toBe(503);
        } finally {
            unconfigured.child.kill();
        }
    });

    it("validates requests and clamps limits", async () => {
        expect((await post(server.url, { code: "function solve(){}", entry: "a;b", tests: [{ id: "t" }] })).status).toBe(400);
        expect((await post(server.url, { language: "python", code: "x", tests: [{ id: "t" }] })).status).toBe(400);
        expect((await post(server.url, { code: "x".repeat(70 * 1024), tests: [{ id: "t" }] })).status).toBe(413);
        // A client asking for 60 s still gets the 10 s ceiling.
        const res = await post(server.url, { code: "function solve(){ while(true){} }", entry: "solve", timeLimitMs: 60_000, tests: [{ id: "t" }] });
        expect((await res.json()).results.t.error).toMatch(/10000ms/);
    }, 20_000);

    it("applies backpressure when the queue is full", async () => {
        const busy = await startServer({ MAX_CONCURRENCY: "1", MAX_QUEUE: "0" });
        try {
            const slow = post(busy.url, { code: "function solve(){ while(true){} }", entry: "solve", tests: [{ id: "t" }] });
            await new Promise((r) => setTimeout(r, 300));
            const rejected = await post(busy.url, { code: "function solve(){ return 1 }", entry: "solve", tests: [{ id: "t" }] });
            expect(rejected.status).toBe(503);
            expect(rejected.headers.get("retry-after")).toBe("2");
            await slow;
        } finally {
            busy.child.kill();
        }
    }, 15_000);

    it("reports an unreachable runner as 503 without leaking details", async () => {
        process.env.CODE_RUNNER_URL = "http://127.0.0.1:1";
        await expect(executeTests({ code: "1", tests: [{ id: "t", input: null }], timeLimitMs: 100 }))
            .rejects.toMatchObject({ status: 503 });
    });
});
