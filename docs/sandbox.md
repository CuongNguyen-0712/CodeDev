# Coding sandbox (codedev_sandbox)

## Why

Coding challenges were graded from outputs **reported by the browser** (`results` sent to
`startCodingSubmissionAction` / `finishCodingSubmissionAction`). The browser runner (a Web
Worker per test) is fine for trying code, but anyone can send forged outputs and collect the
points. With the code runner configured, the server produces the outputs itself and ignores the
browser's report.

## Flow

```
browser ──Run──> Web Worker (lib/challenges/runner.js)          quick feedback, never graded
browser ──Submit──> codedev_app: startCodingSubmission
                      1. auth, lesson/course access, source size (64 KB), attempts left
                      2. POST sandbox:4100/v1/execute  {code, harness, entry, tests:[{id,input}], limits}
                         └─ run-job in a slot (sandbox/vercel/run-job): compile once, one process per test
                            javascript: runner.cjs harness ("function"); other languages: stdin/stdout ("stdio")
                      3. grade outputs against expected (expected never leaves the app)
                      4. a sample failed -> 409, no attempt used
                      5. snapshot code to S3, record the attempt (pending), keep server grades in Redis
                    finishCodingSubmission
                      6. finalize with the server grades (browser results ignored), award points once
```

- No runner configured (`CODE_RUNNER_URL` and `CODE_RUNNER_PROVIDER` unset): development and
  tests grade javascript from browser-reported outputs; production (`APP_ENV=production`) refuses
  coding submissions with 503 (no attempt used), since those outputs can be forged for points.
- Limits come from `challenge.coding_configs` (`time_limit_ms`, `memory_limit_mb`), never from the
  client; the runner also clamps them (100 ms–10 s, 32–256 MB).
- A runner outage or full queue returns 503 **before** an attempt is recorded.
- Hidden test inputs are no longer sent to the browser when the server grades.
- "Run" stays in the browser: it executes on the learner's own machine and grades nothing.

## API

`POST /v1/execute` with `Authorization: Bearer $CODE_RUNNER_TOKEN`:

```json
{ "language": "javascript", "code": "...", "harness": "...", "entry": "createLock",
  "tests": [{ "id": "12", "input": {} }], "timeLimitMs": 2000, "memoryLimitMb": 128 }
```

-> `{ "results": { "12": { "ok": true, "output": ..., "error": null, "timedOut": false, "timeMs": 7, "logs": [] } } }`

`language`: `javascript`, `python`, `c`, `cpp`, `java`, `go`, `rust` (`GET /health` lists them; without
`RUN_JOB`, i.e. `node sandbox/server.mjs` on the host, only `javascript`). For stdio languages `harness`
and `entry` are ignored, `input` goes to stdin and `output` is stdout; a compile error is reported on every
test as `Compilation failed:\n<compiler output>`. The app grades stdout with `stdoutMatches`
(`lib/challenges/compare.js`), and "Run" for those languages goes through `runCodingSamplesAction`
(sample tests only, no attempt used, 503 without a runner).

400 invalid request (unknown language, identifier entry, 1–50 tests), 401 bad token, 413 too
large, 503 + `Retry-After` when `MAX_CONCURRENCY` jobs run and `MAX_QUEUE` wait.

## Isolation layers

| Layer | Setting |
|---|---|
| Container (compose `sandbox`) | read-only root, tmpfs `/tmp` `/var/tmp` `/run` `/vercel/jobs` (`noexec`) and `/work` (exec, 768 MB), `no-new-privileges`, `cap_drop: ALL` + `cap_add` SETUID, SETGID, CHOWN, DAC_OVERRIDE, FOWNER, KILL (server.mjs/run-job are root to switch to the slot users), `pids_limit: 256`, 2 GB memory, 2 CPUs, `nofile` 256 |
| Slot (per job, run-job) | learner code and compilers run as `run01..run0N` (no capabilities, `CapEff` 0), own work dir (0700), `prlimit` (64 processes, 128 files, CPU seconds, address space for C/C++/Rust/Python), wall-clock kill; job file, server environment and other slots unreadable (checked 2026-10-20) |
| Network | `internal` network: no egress, no host, no metadata endpoint, cannot reach redis/postgres or the app (the app talks to it through `sandbox-gateway`, never on this network); no published port |
| Secrets | the sandbox gets only `CODE_RUNNER_TOKEN`; no database, auth or storage credentials. No Docker socket anywhere |
| Process (per test) | `node --permission`: no file system access (except reading `runner.cjs`), no child processes, no worker threads, no native addons; empty environment; `--max-old-space-size` = challenge limit; SIGKILL after the time limit + 1 s start-up |
| Runner | `process.kill`, `process.binding`, `dlopen`... removed before user code (same uid could otherwise signal the server or other runs); result read only from the line carrying a per-run nonce on fd 3 (user output cannot pass for it); logs, output and stderr capped |
| Server | token checked with `timingSafeEqual`, body ≤ 512 KB, source ≤ 64 KB, input ≤ 128 KB per test, bounded concurrency and queue (backpressure), graceful drain on SIGTERM |

Verified by `__tests__/sandbox/runner.integration.test.js` (process layer) and by running the
same escape attempts against the container: no file access, no process spawn, no egress (the
internet, 169.254.169.254, the host and `redis` all unreachable), `CapEff` 0, read-only root.

## Remaining risks

- Containers share the host kernel. A kernel or V8 sandbox escape would reach the host. For
  hostile traffic at scale, run the sandbox under gVisor (`runtime: runsc`) or a microVM
  (Firecracker / Kata), or use a dedicated execution service.
- Runs of different learners share one container, separated by slot users (run-job), not by a
  PID namespace. The server and run-job are root inside the container with six capabilities, so a
  bug in server.mjs or run-job is more serious than before; learner code itself has none. A
  container per execution would need Docker daemon access, which is deliberately not granted.
- The Node permission model does not restrict network access in Node 24; the internal network
  is what blocks it. Do not attach the sandbox to another network.
- CPU-heavy code is limited by the per-test time limit, `prlimit --cpu` and `cpus: 2`.
- Production on Vercel cannot reach a Docker sandbox. Enabling server grading there needs the
  sandbox hosted somewhere reachable over TLS (keep the token secret, restrict by network).

## Vercel Sandbox (production)

Live since 2026-10-20 (`lib/challenges/vercelRunner.js`, selected by `CODE_RUNNER_PROVIDER=vercel`):

- **One shared, named, persistent sandbox** `codedev-runner-v4` (image `codedev-runner:v4` from VCR since
  2026-10-22: v3 added PHP, TypeScript, Kotlin and C#, v4 a kotlinc class-data archive and a 60 s Kotlin
  compile limit; `v2` before,
  `deny-all` network, 2 vCPU = slots `run01`/`run02`, `keepLastSnapshots: 1`). Chosen over one
  sandbox per language: on the Hobby plan (10 concurrent sandboxes, 15 GB snapshot storage, 5 h
  Active CPU/month) a single warm VM has fewer cold starts and one snapshot, and the image already
  has every toolchain. `CODE_RUNNER_SANDBOXES='{"java":"codedev-runner-java-v2"}'` moves a language
  to its own sandbox later without code changes; `CODE_RUNNER_VCPUS` raises the slots (max 4 on Hobby).
- `Sandbox.getOrCreate({ name })` creates it on first use; afterwards every call resumes it from its
  snapshot. The session timeout is 10 minutes and each job extends it by its budget, so an idle
  sandbox stops on its own (memory is billed while it runs).
- Per job: lease a slot in Redis (`code-runner:<name>:<slot>`), `writeFiles` the job to
  `/vercel/jobs/<id>.json`, `runCommand('/opt/codedev/run-job', [id, slot], { sudo: true })`.
  No free slot, or the sandbox unreachable, is a 503 before any attempt is recorded.
- New image: build/push `codedev-runner:vN`, set `CODE_RUNNER_IMAGE` and a new `CODE_RUNNER_SANDBOX`
  name (`-vN`), deploy, then remove the old sandbox (`vercel sandbox remove <name> --delete-orphan-snapshots`).
  Recycle the sandbox the same way periodically so a compromise cannot persist.
- Test: `__tests__/sandbox/vercel.integration.test.js` (opt-in, needs `VERCEL_OIDC_TOKEN` and a
  `CODE_RUNNER_SANDBOX` name containing "test"); 8/8 on 2026-10-20, 12/12 on v3 and v4 (2026-10-22).

### Background (design notes)

Design: one long-lived Vercel Sandbox (Firecracker microVM) **per language** (`javascript`,
`python`, `c`, `cpp`, `java`, `go`, `rust`), started from the `codedev-runner` image with
`deny-all` networking and `persistent: false`, reached through `@vercel/sandbox` (OIDC auth on
Vercel). Each VM has a few job slots (one per vCPU) that the app leases in Redis; a stopped VM is
deleted and recreated from the image, so every session starts clean. The Docker runner above
stays for local development.

Trade-off: learners share a VM, separated by uid (slot users) and per-job cleanup, which is weaker
than a VM per submission. Recycle sessions regularly to bound how long a compromise could last.

### Image `codedev-runner` (`sandbox/vercel/Dockerfile`)

Ubuntu 26.04 with the same layout as the managed `vercel/sandbox/ubuntu` image (user `ubuntu` with
sudo, `HOME=/vercel`). Toolchains: Node.js 24, Python 3.14, gcc/g++ 15.2, OpenJDK 21, Go 1.26
(std cache pre-built, read-only, in `/opt/gocache`), rustc 1.93; since `v3` also PHP 8 (`php -l` as the compile
step), TypeScript 5.9 (`tsc --strict`, then node), Kotlin 2.3 (`kotlinc` + kotlinx.coroutines, run on the JVM) and
.NET 10 (Roslyn `csc.dll` called directly with the framework reference assemblies and implicit usings, no NuGet).

- Slot users `run01`..`run08` (uid 2001–2008, no sudo, no home) run learner code, compilers included.
- `/vercel/jobs` (0700, `ubuntu`) receives job files; `/work/<slot>` (0700, slot user) is the job's
  working directory. The only world-writable directories are `/tmp`, `/var/tmp`, `/dev/shm`,
  `/run/lock` (others are made read-only at build time).

```bash
# local build + self-test (context is sandbox/, runner.cjs is shared with the Docker runner)
docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile -t codedev-runner:v1 --load sandbox
docker run --rm --init --network none codedev-runner:v1 node /opt/codedev/selftest.mjs

# push to VCR
vercel vcr login docker --project codedev --scope codedevteam
docker buildx build --platform linux/amd64 -f sandbox/vercel/Dockerfile \
  --output type=image,name=vcr.vercel.com/codedevteam/codedev/codedev-runner:v1,push=true,oci-mediatypes=true,compression=zstd sandbox
```

(`--init` matters in Docker only: without an init process orphaned learner processes stay as
zombies. A Vercel Sandbox VM has one.)

### `run-job` (`/opt/codedev/run-job`)

The app writes `/vercel/jobs/<jobId>.json`, then runs `sudo /opt/codedev/run-job <jobId> <slot>`:

```json
{ "language": "go", "mode": "stdio", "code": "...", "tests": [{ "id": "12", "input": "5\n" }],
  "timeLimitMs": 2000, "memoryLimitMb": 128 }
```

-> one JSON line `{ "compile": { "ok", "error", "timeMs" }, "results": { "12": { "ok", "output", "error", "timedOut", "timeMs", "logs" } } }`,
or `{ "error": "..." }` (bad job, `slot is busy`).

- `stdio` mode: the input (a string, or JSON for anything else) goes to stdin; `output` is stdout.
  `function` mode (JavaScript only) is the `runner.cjs` harness contract of the Docker runner.
- The job file is read and deleted before learner code runs. Compilation happens once per job;
  limits are clamped as in the Docker runner (100 ms–10 s, 32–256 MB).
- Each process runs as the slot user in its own process group under `prlimit` (64 processes and
  threads, 128 files, 16 MB output files, CPU seconds, address space for C/C++/Rust/Python; the
  JVM, V8 and Go use their heap flags) and a wall-clock kill at limit + 1 s. stdout is capped at
  256 KB, stderr at 8 KB.
- Before and after a job: every process of the slot user is killed (`kill -1` as that user, which
  a fork bomb cannot outrun), its work directory and its files in the shared temp dirs are removed.
- Go: each job gets a private copy of the read-only std cache, with `GOFLAGS=-trimpath` (same as
  the image build; otherwise the cache misses and `go build` takes ~9.5 s instead of ~0.45 s).

`selftest.mjs` (21 checks, all passing in local Docker, 2026-10-19) covers every language end to
end, the function harness and its forged-result defence, compile errors, timeouts, a fork bomb,
a `setsid` daemon, cross-slot reads, double-leasing a slot, sudo/network/job-file access, output
floods, memory limits, the Go cache and the world-writable directory list.

### Phase 0 measurements (2026-10-19, `iad1`, 1 vCPU / 2 GB, 3 runs each, median)

| Language | Compile | Run (prime count < 200 000) |
|---|---|---|
| JavaScript (node) | - | 240 ms |
| Python | - | 1600 ms |
| C (`gcc -O2`) | 90 ms | 30 ms |
| C++ (`g++ -O2`) | 390 ms | 30 ms |
| Java (`javac` + `java`) | 820 ms | 80 ms (single-file source mode: 750 ms total) |
| Go (`go build`, warm cache) | 450 ms | 30 ms |
| Rust (`rustc -O`) | 770 ms | 30 ms |

- Sandbox create from a laptop in Vietnam: ~1–2 s after subtracting the CLI's own ~4 s start-up;
  the custom image is no slower than the default one. The real number from a Vercel Function in
  `iad1` still has to be measured (Phase 1, SDK).
- Inside the VM (v0 image, single `runner` user): no sudo for learner code; with `deny-all`, DNS
  fails (no egress).
- The VM wall clock can jump (`date` went backwards); time inside the VM with `/proc/uptime`.
- Hobby plan limits: 10 concurrent sandboxes, 5,000 creations and 5 h Active CPU per month,
  45 min per session. Pro: 10,000 concurrent.
