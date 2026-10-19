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
                         └─ one throw-away Node process per test (sandbox/runner.cjs)
                      3. grade outputs against expected (expected never leaves the app)
                      4. a sample failed -> 409, no attempt used
                      5. snapshot code to S3, record the attempt (pending), keep server grades in Redis
                    finishCodingSubmission
                      6. finalize with the server grades (browser results ignored), award points once
```

- `CODE_RUNNER_URL` unset: previous behaviour (browser-reported outputs), so deployments without
  a sandbox (Vercel today) keep working. Set it to enforce server grading.
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

400 invalid request (only `javascript`, identifier entry, 1–50 tests), 401 bad token, 413 too
large, 503 + `Retry-After` when `MAX_CONCURRENCY` jobs run and `MAX_QUEUE` wait.

## Isolation layers

| Layer | Setting |
|---|---|
| Container (compose `sandbox`) | read-only root, tmpfs `/tmp` (`noexec`, 16 MB), `cap_drop: ALL`, `no-new-privileges`, non-root `node` (uid 1000), `pids_limit: 64`, 768 MB memory, 1 CPU, `nofile` 256 |
| Network | `internal` network: no egress, no host, no metadata endpoint, cannot reach redis/postgres; no published port |
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
- Runs of different learners share one container (separate processes, same uid). The runner
  removes signalling APIs and the permission model blocks file and process access, but they are
  not separated by a PID namespace. A container per execution would need Docker daemon access,
  which is deliberately not granted.
- The Node permission model does not restrict network access in Node 24; the internal network
  is what blocks it. Do not attach the sandbox to another network.
- CPU-heavy code is limited by the per-test time limit and `cpus: 1`, not by a per-process quota.
- Production on Vercel cannot reach a Docker sandbox. Enabling server grading there needs the
  sandbox hosted somewhere reachable over TLS (keep the token secret, restrict by network).

## Vercel Sandbox (production, in progress)

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
(std cache pre-built, read-only, in `/opt/gocache`), rustc 1.93. About 530 MB.

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
