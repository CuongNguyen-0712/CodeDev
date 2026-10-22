// Self-test for /opt/codedev/run-job, run inside the codedev-runner image as `ubuntu`:
//   docker run --rm --init --network none codedev-runner:v1 node /opt/codedev/selftest.mjs
//   sandbox run --image codedev-runner:v1 --network-policy deny-all --rm -- node /opt/codedev/selftest.mjs
// Checks every language end to end plus the isolation the per-language VM design relies on.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
let seq = 0;

async function job(slot, spec) {
    const id = `t${process.pid}-${++seq}`;
    writeFileSync(`/vercel/jobs/${id}.json`, JSON.stringify({ timeLimitMs: 2000, memoryLimitMb: 128, ...spec }));
    const { stdout } = await run("sudo", ["/opt/codedev/run-job", id, slot], { maxBuffer: 4 << 20 }).catch((e) => e);
    const parsed = JSON.parse(stdout.trim().split("\n").pop());
    parsed.jobFileLeft = existsSync(`/vercel/jobs/${id}.json`);
    return parsed;
}
const one = (r) => Object.values(r.results)[0];
const text = (res) => { assert.equal(res.ok, true, res.error); return res.output.trim(); };
const sh = (cmd) => execFileSync("bash", ["-c", cmd], { encoding: "utf8" }).trim();

const PRIMES = {
    javascript: `let n=+require("fs").readFileSync(0,"utf8"),c=0;for(let i=2;i<n;i++){let p=1;for(let j=2;j*j<=i;j++)if(i%j==0){p=0;break}c+=p}console.log(c)`,
    python: `n=int(input())\nc=0\nfor i in range(2,n):\n    j=2;p=1\n    while j*j<=i:\n        if i%j==0: p=0;break\n        j+=1\n    c+=p\nprint(c)`,
    c: `#include <stdio.h>\nint main(){int n,c=0;scanf("%d",&n);for(int i=2;i<n;i++){int p=1;for(int j=2;j*j<=i;j++)if(i%j==0){p=0;break;}c+=p;}printf("%d\\n",c);}`,
    cpp: `#include <iostream>\nint main(){int n,c=0;std::cin>>n;for(int i=2;i<n;i++){bool p=true;for(int j=2;j*j<=i;j++)if(i%j==0){p=false;break;}c+=p;}std::cout<<c<<"\\n";}`,
    java: `import java.util.*;public class Main{public static void main(String[] a){int n=new Scanner(System.in).nextInt(),c=0;for(int i=2;i<n;i++){boolean p=true;for(int j=2;j*j<=i;j++)if(i%j==0){p=false;break;}if(p)c++;}System.out.println(c);}}`,
    go: `package main\nimport "fmt"\nfunc main(){var n,c int;fmt.Scan(&n);for i:=2;i<n;i++{p:=1;for j:=2;j*j<=i;j++{if i%j==0{p=0;break}};c+=p};fmt.Println(c)}`,
    rust: `use std::io::Read;fn main(){let mut s=String::new();std::io::stdin().read_to_string(&mut s).unwrap();let n:u32=s.trim().parse().unwrap();let mut c=0;for i in 2..n{let mut p=1;let mut j=2;while j*j<=i{if i%j==0{p=0;break}j+=1}c+=p}println!("{}",c)}`,
    php: `<?php\n$n=(int)trim(fgets(STDIN));$c=0;for($i=2;$i<$n;$i++){$p=1;for($j=2;$j*$j<=$i;$j++)if($i%$j==0){$p=0;break;}$c+=$p;}echo $c,"\n";`,
    typescript: `const n: number = Number(require("fs").readFileSync(0, "utf8"));let c = 0;for (let i = 2; i < n; i++) { let p = 1; for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = 0; break } c += p }console.log(c)`,
    kotlin: `fun main(){val n=readln().trim().toInt();var c=0;for(i in 2 until n){var p=1;var j=2;while(j*j<=i){if(i%j==0){p=0;break};j++};c+=p};println(c)}`,
    csharp: `int n=int.Parse(Console.ReadLine()!.Trim());int c=0;for(int i=2;i<n;i++){int p=1;for(int j=2;j*j<=i;j++)if(i%j==0){p=0;break;}c+=p;}Console.WriteLine(c);`,
};

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

for (const [language, code] of Object.entries(PRIMES)) {
    test(`${language}: stdio, 2 tests, compiled once`, async () => {
        const r = await job("run01", { language, code, tests: [{ id: "a", input: "100\n" }, { id: "b", input: "200000\n" }] });
        assert.equal(r.compile.ok, true, r.compile.error);
        assert.equal(text(r.results.a), "25");
        assert.equal(text(r.results.b), "17984");
        assert.equal(r.jobFileLeft, false);
        return `compile ${r.compile.timeMs}ms, run ${r.results.b.timeMs}ms`;
    });
}

test("javascript: function mode with harness and entry", async () => {
    const r = await job("run02", {
        language: "javascript", mode: "function",
        code: "function add(a, b) { console.log('hi'); return a + b }",
        harness: "async function __harness(input, ctx) { return ctx.callEntry(input) * 10 }",
        entry: "add",
        tests: [{ id: "x", input: { a: 1, b: 2 } }],
    });
    assert.equal(one(r).ok, true, one(r).error);
    assert.equal(one(r).output, 30);
    assert.equal(one(r).logs[0].text, "hi");
});

test("javascript: function mode cannot forge the result line", async () => {
    const r = await job("run02", {
        language: "javascript", mode: "function", entry: "f",
        code: "function f() { require('fs').writeSync(3, 'deadbeef{\"ok\":true,\"output\":42}\\n'); return 1 }",
        tests: [{ id: "x", input: null }],
    });
    assert.notEqual(one(r).output, 42);
});

test("compile error: reported once, tests not run", async () => {
    const r = await job("run01", { language: "c", code: "int main( {", tests: [{ id: "a", input: "" }, { id: "b", input: "" }] });
    assert.equal(r.compile.ok, false);
    assert.match(r.compile.error, /error/);
    assert.equal(r.results.b.error, "Compilation failed");
});

test("timeout: infinite loop is killed near the limit", async () => {
    const r = await job("run01", { language: "python", code: "while True: pass", timeLimitMs: 500, tests: [{ id: "a", input: "" }] });
    assert.equal(one(r).timedOut, true);
    assert.ok(one(r).timeMs < 3000, `took ${one(r).timeMs}ms`);
});

test("fork bomb is contained and the slot still works", async () => {
    const r = await job("run03", { language: "c", code: "#include <unistd.h>\nint main(){for(;;)fork();}", timeLimitMs: 1000, tests: [{ id: "a", input: "" }] });
    assert.equal(one(r).ok, false);
    assert.equal(sh("ps -U run03 -o stat= | grep -vc Z || true"), "0");
    const again = await job("run03", { language: "python", code: "print(1)", tests: [{ id: "a", input: "" }] });
    assert.equal(text(one(again)), "1");
});

test("escaped daemon (setsid) and its files are removed after the job", async () => {
    const code = "#include <unistd.h>\n#include <stdio.h>\nint main(){if(fork()==0){setsid();FILE*f=fopen(\"/tmp/leak\",\"w\");fputs(\"x\",f);fclose(f);sleep(60);}puts(\"ok\");}";
    const r = await job("run04", { language: "c", code, tests: [{ id: "a", input: "" }] });
    assert.equal(text(one(r)), "ok");
    assert.ok(one(r).timeMs < 2000, `waited ${one(r).timeMs}ms for the daemon`);
    assert.equal(sh("ps -U run04 -o stat= | grep -vc Z || true"), "0");
    assert.equal(existsSync("/tmp/leak"), false);
});

test("slots cannot read each other's work directory", async () => {
    const slow = job("run05", { language: "python", code: "import time; time.sleep(2); print('done')", timeLimitMs: 4000, tests: [{ id: "a", input: "" }] });
    await new Promise((r) => setTimeout(r, 700));
    const spy = await job("run06", { language: "python", code: "print(open('/work/run05/main.py').read())", tests: [{ id: "a", input: "" }] });
    assert.equal(one(spy).ok, false);
    assert.match(one(spy).error, /Permission denied/);
    assert.equal(text(one(await slow)), "done");
});

test("same slot twice at once: second job is refused", async () => {
    const a = job("run07", { language: "python", code: "import time; time.sleep(1.5)", timeLimitMs: 3000, tests: [{ id: "a", input: "" }] });
    await new Promise((r) => setTimeout(r, 500));
    const b = await job("run07", { language: "python", code: "print(1)", tests: [{ id: "a", input: "" }] });
    assert.equal(b.error, "slot is busy");
    await a;
});

test("no sudo, no job files, no network for learner code", async () => {
    const code = [
        "import subprocess, os, socket",
        "print(subprocess.run(['sudo','-n','true'],capture_output=True).returncode)",
        "print(len(os.listdir('/vercel/jobs')) if os.access('/vercel/jobs', os.R_OK) else 'denied')",
        "try:\n    socket.create_connection(('1.1.1.1', 443), timeout=2); print('net')\nexcept OSError: print('nonet')",
    ].join("\n");
    const r = await job("run08", { language: "python", code, timeLimitMs: 5000, tests: [{ id: "a", input: "" }] });
    assert.deepEqual(text(one(r)).split("\n"), ["1", "denied", "nonet"]);
});

test("output flood is cut off", async () => {
    const r = await job("run01", { language: "python", code: "while True: print('x'*1000)", tests: [{ id: "a", input: "" }] });
    assert.equal(one(r).error, "Output limit exceeded");
});

test("memory limits: C (RLIMIT_AS), Java (-Xmx), JavaScript (heap)", async () => {
    const c = await job("run01", { language: "c", memoryLimitMb: 64, code: "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){size_t mb;scanf(\"%zu\",&mb);char*p=malloc(mb<<20);if(!p)return 3;memset(p,1,mb<<20);printf(\"%d\\n\",p[mb]);return 0;}", tests: [{ id: "a", input: "512" }] });
    assert.equal(one(c).ok, false, `C: ${JSON.stringify(one(c))}`);
    const java = await job("run01", { language: "java", memoryLimitMb: 64, code: "public class Main{public static void main(String[] a){long[][] x=new long[1000][];for(int i=0;i<1000;i++)x[i]=new long[1<<20];}}", tests: [{ id: "a", input: "" }] });
    assert.match(one(java).error, /Memory limit exceeded/);
    const js = await job("run01", { language: "javascript", memoryLimitMb: 64, timeLimitMs: 5000, code: "const a=[];for(;;)a.push(new Array(1e6).fill(1))", tests: [{ id: "a", input: "" }] });
    assert.equal(one(js).ok, false, `JS: ${JSON.stringify(one(js))}`);
});

test("Go cache: shared copy is read-only, job copy is private", async () => {
    assert.equal(sh("stat -c %U /opt/gocache"), "root");
    const r = await job("run02", { language: "go", code: "package main\nimport (\"fmt\";\"os\")\nfunc main(){fmt.Println(os.WriteFile(\"/opt/gocache/x\",[]byte(\"x\"),0644)!=nil)}", tests: [{ id: "a", input: "" }] });
    assert.equal(text(one(r)), "true");
    assert.ok(r.compile.timeMs < 5000, `go build took ${r.compile.timeMs}ms (cache miss?)`);
});

test("every world-writable directory is cleaned by run-job", async () => {
    const cleaned = ["/tmp", "/var/tmp", "/dev/shm", "/run/lock"];
    const found = sh("sudo find / -xdev \\( -path /proc -o -path /sys \\) -prune -o -type d -perm -0002 -print 2>/dev/null || true").split("\n").filter(Boolean);
    const extra = found.filter((d) => !cleaned.some((c) => d === c || d.startsWith(c + "/")));
    assert.deepEqual(extra, []);
});

test("bad requests are rejected", async () => {
    assert.match((await job("run01", { language: "cobol", code: "x", tests: [{ id: "a" }] })).error, /unsupported language/);
    assert.match((await job("run01", { language: "python", mode: "function", code: "x", tests: [{ id: "a" }] })).error, /javascript only/);
    assert.match((await job("../etc", { language: "python", code: "x", tests: [{ id: "a" }] })).error, /slot must be/);
});

let failed = 0;
for (const { name, fn } of cases) {
    try {
        const note = await fn();
        console.log(`PASS ${name}${note ? ` (${note})` : ""}`);
    } catch (error) {
        failed++;
        console.log(`FAIL ${name}\n     ${error.message.split("\n").join("\n     ")}`);
    }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
