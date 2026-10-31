# CodeDev — Kế hoạch điều phối (Inngest + PostgreSQL + Vercel Sandbox), Sandbox và Quiz

Cập nhật: 2026-10-30, bản 5. **Đã chọn Hướng B** (so sánh các hướng: [queue-execution-options.md](queue-execution-options.md)). Tham chiếu `file:dòng` đúng tại thời điểm viết. Giới hạn của dịch vụ lấy từ tài liệu cùng ngày (xem phần Nguồn).

**Đã chốt:**

- **Inngest** điều phối toàn bộ việc nền: hàng đợi, retry, cron, workflow. Function chạy trong chính app Next.js (`serve()` tại `/api/inngest`).
- **PostgreSQL** là durable job store (`challenge.code_runs`, `identity.auth_outbox`, `ops.dead_letters`).
- **Vercel Sandbox** (Firecracker microVM) chạy code học viên, dùng lại `lib/challenges/vercelRunner.js`. **Không có Execution VM.**
- Không dùng QStash, BullMQ, Trigger.dev.
- Không dùng Redis **cho queue**. Upstash Redis giữ cho cache, rate limit, session (17 module dùng `lib/cache.js`).
- Docker self-host vẫn chạy được với `CODE_RUNNER_PROVIDER=docker` (sandbox trong `compose.yml`).
- Quiz không hiện gợi ý "lần trước câu này sai". Chưa thiết kế bài coding nhiều file.

## Trạng thái triển khai (2026-10-30)

P0–P4 đã có code và test. Inngest chỉ hoạt động khi có `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (hoặc `INNGEST_DEV=1`). Khi chưa có key, mọi việc chạy inline như trước: outbox xử lý ngay sau commit, bài chấm chạy trong request. Riêng cron hằng ngày thì **không chạy** trên Vercel cho tới khi có key, vì `vercel.json` đã bị xoá.

| Phần | File chính |
|---|---|
| Quiz (mục 5) | `services/challenge.service.js`, `db/challenge.db.js`, `lib/error/apiError.js`, `lib/serverAction.js`, `components/learning/[id]/challenges/quizChallenge.jsx` |
| Giới hạn, rate limit, sandbox (4.1, 3) | `lib/challenges/limits.js`, `lib/rateLimit.js`, `lib/challenges/codeRunner.js`, `sandbox/server.mjs` |
| Inngest | `lib/inngest.js`, `app/api/inngest/route.js`, `jobs/*.js` |
| Job store | `db/migrations/20261030_001_background_jobs.sql`, `db/codeRun.db.js`, `db/deadLetter.db.js`, `scripts/dlq.mjs` |
| Outbox (2.7) | `services/authOutbox.service.js`, `db/session.db.js` |
| Chấm bài qua hàng đợi (2.4–2.6) | `services/challenge.service.js` (`queueCodeRun` … `sweepCodeRuns`), `actions/challenge.actions.js`, `mutations/challenge.mutation.js`, `lib/challenges/vercelRunner.js` |

**Đã kiểm chứng trên local (Inngest dev server `inngest-cli@1.46.0` + `next dev` với `INNGEST_DEV=1`):**

- **Đăng ký function.** 8 function (6 function + 2 handler `onFailure`) đăng ký không lỗi, tức cấu hình `concurrency`, `priority`, `throttle` và `timeouts` đều hợp lệ.
- **Run và Submit trên UI.** Bài TypeScript chạy qua Inngest khoảng 4 giây:
  - Run code starter: 0/2 sample pass.
  - Run lời giải: 2/2 sample pass.
  - Submit: "All 7 tests passed", cộng 20 điểm và 10 EXP.
- **Outbox.** Event được giao qua `outbox-deliver`.
- **Event lỗi vĩnh viễn.** Row bị đánh `dead_at`, sinh 2 dead letter (từ `onFailure` và `dead-letter-sink`).
- **Run mất event.** Khi dev server khởi động lại, event của run bị rơi; `sweeper` chuyển run đó sang `cancelled` kèm thông báo "no attempt was used".
- **Quiz trên UI:**
  - Đếm ngược 60 giây.
  - Câu sai hiện "Your answer is not correct yet" theo cả câu, không đánh dấu từng lựa chọn.
  - Bấm làm lại thì không còn dấu đúng/sai của lần trước.
  - Nộp trong lúc một tab khác vừa nộp thì nhận 429. Form vẫn giữ câu trả lời, hiện lỗi inline "Your answers are kept. You can submit again in 0:46." và khoá nút.
  - Hết giờ chờ, nộp lại: "Passed 10/10".

**Khác với thiết kế bên dưới:**

- Function nằm ở `jobs/`, không phải `inngest/functions/`. Tránh trùng tên với gói `inngest`.
- Không có step `notify`.
  - Trình duyệt poll `getCodeRunAction` mỗi 1,5 giây.
  - Submit vẫn phát `challenge-submitted` qua Pusher (`afterSubmission`) như trước.
- Outbox:
  - Không thêm cột `idempotency_key`. Event id `outbox-<id>` của Inngest đã chống gửi trùng, và handler đều idempotent.
  - `emailTokenDb.enqueue` là một lệnh insert duy nhất, không có gì cần gộp chung transaction.
  - `session.revoked` vẫn chạy inline trước, rồi mới gửi lên Inngest. Lệnh ghi Redis để thu hồi phiên không nên phải chờ hàng đợi.
- Worker `setInterval` vẫn còn, nhưng chỉ chạy khi chưa cấu hình Inngest. Nó được xoá cùng các cờ fallback (xem 6.1).
- Luồng hai bước `startCodingSubmission` / `finishCodingSubmission` (và key `challenge:pending:*`) vẫn còn, dành cho môi trường dev không có code runner (JS chấm bằng kết quả trình duyệt gửi lên). Khi có runner, client luôn đi qua `queueCodeRun`.
- Chưa làm: cột `def_version` và cache verdict (P5).
- Dev: service `inngest` trong `compose.yml` (profile `dev`, `inngest/inngest:v1.46.0`) chạy cùng `npm run services:up`; chạy `next dev` với `INNGEST_DEV=1`. Dashboard ở http://127.0.0.1:8288. Chi tiết: [docker.md](docker.md).

---

## 1. Hiện trạng cần sửa (tóm tắt khảo sát)

| Khu vực | Vấn đề | Vị trí |
|---|---|---|
| Outbox | Không có giới hạn retry, không có DLQ | `services/authOutbox.service.js:94,100` |
| Outbox | Lease 30s ngắn hơn timeout SMTP (~40s), có thể gửi mail trùng | `db/session.db.js:317`, `lib/mail.js:15` |
| Outbox | `emailTokenDb.enqueue` insert ngoài transaction | `db/emailToken.db.js:154` |
| Outbox | Request chờ SMTP (inline `await processAuthOutbox`); trên Vercel không có gì drain chắc chắn (`setInterval` 15s, route POST không nằm trong cron) | `services/authOutbox.service.js:123`, `app/api/internal/auth-outbox/route.js` |
| Chạy code | Chạy đồng bộ trong server action (timeout app 110s); budget sandbox không cap (~665s) | `lib/challenges/codeRunner.js:49` |
| Chạy code | Vercel Sandbox: 2 slot lease bằng `SET NX`, không có hàng đợi; job thứ 3 nhận 503 | `lib/challenges/vercelRunner.js:65` |
| Chạy code | Không giới hạn số job đồng thời mỗi user. Một bucket `rl:challenge` 20/phút dùng chung cho quiz/run/submit | `lib/rateLimit.js:211` |
| Chạy code | 50 test × 128 KB input vượt body 512 KB; sandbox trả 413 nhưng app báo 502 | `sandbox/server.mjs:47,50` |
| Chạy code | Không cache verdict. `code_runs` có sẵn trạng thái hàng đợi nhưng chưa dùng | `db/challenge.db.js:458` |
| Quiz | Cooldown 5 phút | `services/challenge.service.js:21` |
| Quiz | Làm lại bị lỗi thì hiện lại kết quả cũ | `components/learning/[id]/challenges/quizChallenge.jsx:189` |

Giữ nguyên, không đưa vào queue:

- EXP / points / achievements: client cần kết quả ngay, đã idempotent.
- Webhook thanh toán: đã dedupe, provider tự retry.
- `invalidateUserCache`: chỉ một `INCR`.
- Pusher: fire-and-forget.

---

## 2. Kiến trúc

### 2.1 Sơ đồ

```
Vercel (Next.js)                                                       Vercel Sandbox (microVM, deny-all network)
────────────────                                                       ──────────────────────────────────────────
action: tx code_runs(queued) ─commit─► inngest.send(code/run.requested, id=exec-<runId>)
                                                │
/api/inngest  (serve(), maxDuration 300)        ▼
  fn code-run   concurrency: sandbox ≤ VCPUS, userId ≤ 1
    step execute ── vercelRunner (lease slot) ─────────────────────► codedev-runner-v4[-i]
       └─ ghi result vào code_runs (trả về Inngest chỉ status)
    step finalize (tx, WHERE status='queued') ─► EXP/points như hiện tại
    step notify ─► Pusher private-user-{id}
    onFailure ─► failed + hoàn lượt + ops.dead_letters

action: tx dữ liệu + auth_outbox ─commit─► inngest.send(outbox/created, id=outbox-<id>)
  fn outbox-deliver  throttle SMTP ─► handler hiện có (SMTP / S3 / Cloudinary / session)

cron (Inngest): sweeper */10, account-maintenance 03:00, exp-audit 03:30
fn dead-letter-sink ◄── inngest/function.failed, inngest/function.cancelled
```

### 2.2 Hạ tầng Inngest

- Gói `inngest`. `lib/inngest.js` (client, `id: 'codedev'`).
- `app/api/inngest/route.js`: `serve({ client, functions })` và `export const maxDuration = 300`.
- `inngest/functions/`: `codeRun.js`, `outboxDeliver.js`, `sweeper.js`, `accountMaintenance.js`, `expAudit.js`, `deadLetterSink.js`.
- Env: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Chỉ nằm trên Vercel, hoặc trong container `app` khi chạy Docker.
- Dev: `npx inngest-cli@latest dev`, thêm service `inngest` vào compose profile `dev`.
- Cờ fallback:
  - `CODE_EXEC_MODE=sync`: giữ luồng chấm bài đồng bộ hiện tại.
  - `OUTBOX_DELIVERY=inline`: giữ luồng outbox hiện tại.
  - Dùng khi không chạy Inngest, hoặc để rollback.

### 2.3 PostgreSQL làm job store

**Migration `db/migrations/2026110x_001_exec_jobs.sql`:**

1. `challenge.code_runs` đã có `status (queued/running/completed/failed/timeout/cancelled)`, `run_type (manual/submit)`, `queued_at/started_at/finished_at`, index một phần cho `queued/running`. Thêm cột:
   - `deadline_at timestamp`, `published_at timestamp`
   - `sandbox text`, `def_version text`
   - `result jsonb`, `error text`
2. Mỗi user chỉ một job đang chờ:
   ```sql
   CREATE UNIQUE INDEX uq_code_runs_user_active
     ON challenge.code_runs (user_id) WHERE status IN ('queued','running');
   ```
3. Index cho sweeper: `(status, published_at) WHERE status = 'queued'`.

**Migration `2026110x_002_outbox_reliability.sql`:**

- `CREATE TABLE IF NOT EXISTS identity.auth_outbox (...)`. Hiện bảng chỉ có trong schema dump.
- Thêm `idempotency_key` (unique một phần), `max_attempts DEFAULT 8`, `published_at`, `dead_at`.
- Bảng mới:
  ```
  ops.dead_letters (id, source, kind, ref, payload jsonb, error, attempts,
                    inngest_run_id, created_at, resolved_at, resolution)
  ```

`code_runs` và `auth_outbox` **chính là outbox**: row có `published_at IS NULL` là việc chưa gửi event.

**Trạng thái `code_runs`:**

```
queued ──(execute bắt đầu)─► running ──(finalize)─► completed (verdict trong result)
   │                            ├──(sandbox báo hết giờ)─► timeout
   │                            └──(hết retry / onFailure)► failed     → hoàn lượt
   └──(quá deadline khi còn chờ)──────────────────────────► cancelled  → hoàn lượt
```

Khác với bản trước, giờ có `running` thật: step `execute` chạy trong app nên ghi được DB.

### 2.4 Luồng Submit

**1. Action `startCodingSubmission`:**

1. Auth, access, limits (4.1), rate limit `rl:code-submit`.
2. Advisory lock và kiểm tra attempts (đã có).
3. Tra cache verdict (Upstash `lib/cache.remember`). Hit thì finalize ngay và trả kết quả.
4. Admission (mục 3). Từ chối thì trả 503 + `retryAfter`.
5. Transaction:
   - Ghi S3 snapshot (đã có).
   - Insert `code_submissions` (pending) và `code_runs` (`queued`, `run_type='submit'`, `deadline_at = now()+3m`, `sandbox = pickSandbox(language, runId)`).
   - Unique index chặn job thứ hai của cùng user, trả 429.
6. Sau commit: `inngest.send({ id: 'exec-' + runId, name: 'code/run.requested', data: { runId, userId, kind: 'submit', sandbox } })`.
   - Gửi được: set `published_at`.
   - Gửi lỗi: giữ `queued`; sweeper sẽ gửi lại.
7. Trả `{ runId, status: 'queued', position }`.

**2. Function `code-run`:**

```js
inngest.createFunction({
  id: 'code-run',
  idempotency: 'event.data.runId',
  concurrency: [
    { key: 'event.data.sandbox', limit: VCPUS },   // mỗi microVM nhận đúng số slot vCPU
    { key: 'event.data.userId', limit: 1 },
  ],
  priority: { run: "event.data.kind == 'manual' ? 60 : 0" },   // kiểm tra cú pháp với SDK
  timeouts: { start: '3m' },
  retries: 2,
  onFailure: markFailedRefundAndDeadLetter,
}, { event: 'code/run.requested' }, handler)
```

1. `step.run('execute')`:
   - `UPDATE code_runs SET status='running', started_at=now() WHERE public_id=$1 AND status IN ('queued','running')`.
     - 0 row: dừng (đã xử lý hoặc đã huỷ).
     - Cho phép `running` vì đây có thể là lần retry.
   - `deadline_at` đã qua: `cancelled` + hoàn lượt, dừng.
   - Đọc source snapshot (S3 private) và definition (cache), rồi gọi `runOnServer` (`services/challenge.service.js:405`, dùng lại).
   - Ghi `result` vào `code_runs`. **Return về Inngest chỉ `{ status }`**, để output test và test ẩn không lưu bên Inngest.
   - Sandbox lỗi hoặc hết slot: throw, Inngest retry. Code học viên lỗi, timeout hay sai đáp án là kết quả hợp lệ, không throw.
2. `step.run('finalize')`:
   ```sql
   UPDATE ... SET status=$s, finished_at=now() WHERE public_id=$1 AND status='running'
   ```
   - 0 row: dừng.
   - Ngược lại: chạy logic `finishCodingSubmission` hiện có (EXP, points, achievements; idempotent sẵn), đọc grades từ `code_runs.result` thay cho `challenge:pending:<subId>`. Sample fail: **không tính lượt**, giữ nghĩa cũ.
3. `step.run('notify')`: ghi cache verdict, `publishToUser('submission-updated', { runId, status })`.
4. `onFailure`: `failed` + hoàn lượt + `ops.dead_letters` + Pusher "Hệ thống chấm bài đang bận, lượt nộp đã được hoàn".

**3. Client:**

- Nghe Pusher `private-user-{id}`.
- Fallback poll `getSubmissionStatus` mỗi 2s khi `queued`/`running`.
- Hiển thị "Đang xếp hàng (vị trí N)" / "Đang chấm…".

### 2.5 Luồng Run sample

- JavaScript vẫn chạy trong trình duyệt như hiện tại.
- Ngôn ngữ khác đi cùng function `code-run`:
  - `run_type='manual'`, `kind: 'manual'` (priority cao hơn), `deadline_at = now()+45s`.
  - Không tính lượt, không finalize EXP; `notify` gửi luôn kết quả sample.
- Action trả `runId` ngay; kết quả về qua Pusher hoặc poll.
- Độ trễ thêm: một chặng event → function, cộng thời gian resume sandbox nếu nó đã ngủ (sau 10 phút nhàn rỗi). Cần đo ở đầu P4.

### 2.6 Pool Vercel Sandbox

- **Tên sandbox:**
  - Giữ cơ chế hiện có: `CODE_RUNNER_SANDBOX` cùng override theo ngôn ngữ `CODE_RUNNER_SANDBOXES` (JSON, `lib/challenges/vercelRunner.js:37`).
  - Thêm `CODE_RUNNER_POOL_SIZE` (mặc định 1). Tên thật là `<name>-<i>` với `i = hash(runId) % POOL_SIZE`.
- **`pickSandbox`:** hàm thuần trong `vercelRunner.js`, trả tên sandbox. Action lưu vào `code_runs.sandbox` và event dùng làm concurrency key. Nhờ vậy mỗi microVM không bao giờ nhận quá `VCPUS` job.
- **`leaseSlot`** (Redis `SET NX`) giữ làm lớp bảo vệ thứ hai, nhưng:
  - Không còn trả 503 khi hết slot. Hàm throw để Inngest retry.
  - TTL lease = budget + 30s như cũ.
- **Docker (`CODE_RUNNER_PROVIDER=docker`):**
  - `sandbox = 'docker'`, limit = `CODE_RUNNER_CONCURRENCY`.
  - `MAX_QUEUE` của `sandbox/server.mjs` hạ xuống bằng số slot, vì Inngest đã xếp hàng.
- **Sửa sandbox server (Docker):**
  - `req.on('close')`: kill job khi client bỏ cuộc.
  - Budget cap 120s.
  - `Retry-After` không còn cố định 2s.

### 2.7 Outbox (email, storage, session)

- `emailTokenDb.enqueue` chạy trong cùng transaction với việc tạo token.
- `idempotency_key` theo nghiệp vụ, ví dụ: `email.verify:<tokenId>`, `session.revoked:<sessionId>`, `storage.purge:<userId>`.
- Sau commit: `inngest.send({ id: 'outbox-' + id, name: 'outbox/created', data: { id, kind } })`, rồi set `published_at`.
- Function `outbox-deliver`:
  ```js
  {
    id: 'outbox-deliver',
    idempotency: 'event.data.id',
    concurrency: [{ key: 'event.data.kind', limit: 2 }],
    throttle: { key: 'event.data.kind', limit: 10, period: '1m' },   // tốc độ SMTP Gmail
    retries: 5,
    onFailure: markOutboxDead,
  }
  ```
  - `step.run('deliver')`: `SELECT ... FOR UPDATE SKIP LOCKED`.
    - Đã `processed_at`: dừng.
    - Gọi handler hiện có (`services/authOutbox.service.js:25-73`), xong thì set `processed_at`.
  - Lỗi vĩnh viễn (thiếu handler, payload sai, SMTP 5xx "user unknown"): `NonRetriableError`. `onFailure` set `dead_at`.
- Bỏ `ensureAuthOutboxWorker` (`setInterval`) và lời gọi inline `await processAuthOutbox` ở `auth.service.js`, `emailVerification.service.js`, `accountLink.service.js`, `accountMaintenance.service.js`.
- Thêm việc xoá avatar cũ (`services/media.service.js:94`) vào outbox với kind `storage.delete`.

### 2.8 Cron

| Function | Lịch | Việc |
|---|---|---|
| `sweeper` | `*/10 * * * *` | Một step đếm việc, không có việc thì dừng (giữ hạn mức execution). Các việc khi có: (1) `code_runs` `queued`/`running` quá `deadline_at` + 2 phút: `cancelled`/`timeout` + hoàn lượt + notify. (2) Row `published_at IS NULL` hoặc cũ hơn 5 phút mà vẫn `queued`: gửi lại event. (3) `auth_outbox` chưa xong quá 15 phút: gửi lại, tối đa 100 row |
| `account-maintenance` | `0 3 * * *` | Mỗi batch 50 user là một step, không bị `maxDuration` chặn |
| `exp-audit` | `30 3 * * *` | Gọi service hiện có |

- Xoá `crons` trong `vercel.json`. Giữ route `/api/internal/*` để chạy tay.
- Gửi lại event sau 24 giờ không còn được dedup, nhưng vô hại nhờ điều kiện trạng thái.

### 2.9 Retry, Idempotency, DLQ

| Lớp | Retry | Idempotency | Khi hết retry |
|---|---|---|---|
| Gửi event từ action | Không retry trong request; sweeper gửi lại | Event `id` (24h) + `idempotency` của function | — |
| `code-run` | 2, theo step (step đã xong không chạy lại) | `WHERE status IN (...)` ở mỗi step; unique EXP/points | `onFailure` → `failed`, hoàn lượt |
| `outbox-deliver` | 5 | `processed_at` + `idempotency_key` | `onFailure` → `dead_at` |
| Cron | Theo step | Thao tác có điều kiện trạng thái | Ghi vào `ops.dead_letters` |
| Bên trong step | **Không retry thêm** | — | — |

**DLQ:**

- `dead-letter-sink` lắng nghe `inngest/function.failed` và `inngest/function.cancelled`, ghi vào `ops.dead_letters`. Kiểm tra tên event với SDK.
- Chạy lại: "Replay" trên dashboard Inngest, hoặc `npm run dlq -- list | retry <id> | resolve <id>`.
- `/api/health` báo degraded khi có dead letter chưa xử lý trong 1 giờ.

### 2.10 Bảo mật

- `/api/inngest` dùng `serve()`, tự xác thực chữ ký. Không tự viết.
- Sandbox giữ `networkPolicy: "deny-all"` (đã có). Code học viên không có secret nào.
- Payload event chỉ có id; output test ghi vào Postgres, không trả về Inngest.
- `INNGEST_SIGNING_KEY` chỉ có trên Vercel, hoặc container `app`.

---

## 3. Backpressure và giới hạn queue

| Cơ chế | Cách làm |
|---|---|
| Đồng thời theo sandbox | `concurrency { key: sandbox, limit: VCPUS }`. Phần dư chờ trong backlog Inngest, không giữ function Vercel nào |
| Độ dài queue | Admission: `SELECT count(*) FROM code_runs WHERE status IN ('queued','running')` (dùng index một phần). Vượt `EXEC_MAX_QUEUED` (200) thì trả 503 + `Retry-After = ceil(queued × avgJobSec / tổng slot)` |
| Mỗi user | Unique index `uq_code_runs_user_active` + concurrency theo `userId` |
| Sandbox có sự cố | Có job `queued` cũ hơn 60s và không job nào xong trong 60s: từ chối submit mới (503) |
| Deadline | `timeouts.start: '3m'`, step `execute` tự kiểm tra `deadline_at`, sweeper dọn phần còn sót |
| Ưu tiên | `priority.run`: Run sample trước Submit |
| Outbox | `throttle` 10/phút cho SMTP, `concurrency` 2 theo `kind`. Không bao giờ từ chối, vì đã nằm trong Postgres |
| Hạn mức Inngest | Tổng concurrency các function ≤ số step đồng thời của gói (Free: 5). Ví dụ: `code-run` 2 (1 sandbox × 2 vCPU), `outbox-deliver` 2, cron 1 |
| Rate limit | `rl:quiz` 20/phút, `rl:code-run` 10/phút, `rl:code-submit` 5/phút (`lib/rateLimit.js`) |
| UI | `retryAfter` truyền qua `lib/serverAction.js` (hiện bị bỏ ở `:42`), hiển thị đếm ngược |

---

## 4. Coding: giới hạn, cache

### 4.1 Giới hạn dung lượng (`lib/challenges/limits.js`, dùng chung app và sandbox)

| Giới hạn | Đề xuất | Hiện tại |
|---|---|---|
| Source | 64 KB | 64 KB |
| Tổng input test mỗi job | ≤ 384 KB | Không kiểm tra |
| Body request sandbox | 512 KB | 512 KB |
| Kết quả lưu vào `code_runs.result` | Mỗi test ≤ 2 KB output, tổng ≤ 256 KB; test ẩn chỉ pass/fail | stdout 256 KB/test |
| Budget job | ≤ 120s cap cứng (Kotlin/Java có hệ số compile riêng) | Không cap (~665s) |
| Payload event | Chỉ id | — |

Sửa đi kèm:

- `codeRunner.js` map 413 thành "Bài quá lớn".
- Validate kích thước test khi tạo/seed challenge.

### 4.2 Cache

| Cache | Nơi lưu | Ghi chú |
|---|---|---|
| Verdict `exec:verdict:{challengeId}:{defVersion}:{language}:{sha256}` | Upstash (`lib/cache.remember`), TTL 24h | `defVersion` = hash(test + harness + limits). Không cache timeout hay lỗi hạ tầng. Cache hit vẫn tính lượt nộp |
| Sample | Phần `samples` của verdict | Run rồi Submit cùng code thì không chạy lại sample |
| Definition / harness | Đã có (10 phút / 1h) | Xoá khi admin sửa challenge |
| `challenge:pending:<subId>` | **Bỏ** | Thay bằng `code_runs.result` |

### 4.3 Hạn mức Vercel Sandbox

- **Hobby:** 10 sandbox đồng thời, 5 giờ Active CPU/tháng, 5.000 lần tạo/tháng, phiên tối đa 45 phút. Vượt thì **tạm dừng tạo sandbox**.
- **Pro:** 10.000 sandbox đồng thời, tính theo dùng.
- Ở đầu P4, đo CPU thật của mỗi ngôn ngữ để ước lượng số lần chấm mỗi tháng. Kotlin/Java nặng hơn nhiều.
- Giữ sandbox persistent hiện tại (`getOrCreate`, ngủ sau 10 phút, snapshot). Không tạo sandbox mới cho mỗi job.

---

## 5. Nghiệp vụ Quiz

### 5.1 Cooldown làm lại 1 phút

- `services/challenge.service.js:21`: `QUIZ_COOLDOWN_SECONDS = 60`.
- `db/challenge.db.js:190`: thông báo theo **giây**, gắn `error.retryAfter`.
- `lib/serverAction.js:42`: trả thêm `retryAfter`.
- `quizChallenge.jsx:185`: toast dùng số giây. Bỏ `Math.round(cooldownSeconds / 60)`, vì công thức này ra "1 minutes", và ra 0 khi < 30s.
- Khi đếm ngược về 0: refetch, chỉ bật nút khi server trả `canSubmit: true`.
- `helpPage.jsx:46`: cập nhật nội dung.
- Test: nộp lần 2 trong 60s nhận 429 với `retryAfter` ≤ 60; sau 60s thì nộp được.

### 5.2 Lỗi hiển thị khi làm lại form nhiều câu hỏi

**Nguyên nhân (đã xác nhận):** `quizChallenge.jsx:189`, `catch` gọi `setRetaking(false)` với mọi lỗi.

- UI quay về `result = state` (`:87`), tức lần nộp **trước**. Dấu đúng/sai cũ hiện lại.
- Câu trả lời mới bị ẩn, vì `answers = result.answers` (`:88`).
- 5xx/mạng không invalidate query (`mutations/challenge.mutation.js:30`).

**Lỗi phụ:**

- Câu nhiều đáp án gắn "Incorrect" lên mọi lựa chọn đã chọn (`:283`).
- Nút Submit biến mất khi refetch nền (`:396`).
- "Answer every question" không chỉ ra câu nào còn thiếu.
- `ChallengeBody` không có `key` (`challengeSection.jsx:296`).

**Thiết kế lại:**

```js
mode: 'review' | 'retaking'
draftAnswers: { [questionId]: optionId | optionId[] }
submitError: { status, message, retryAfter?, missingQuestionIds? } | null
```

- `retaking`: chỉ hiển thị draft. Không có dấu đúng/sai cũ, không có gợi ý "lần trước sai".
- Nộp lỗi:
  - Mặc định: giữ `retaking` và giữ draft. Hiện lỗi inline trên nút Submit (`role="alert"`).
  - **409**: chuyển `review` và invalidate.
  - **429**: khoá nút, đếm ngược theo `retryAfter`.
  - **400 thiếu câu**: nhảy tới câu thiếu đầu tiên, đánh dấu các câu thiếu.
  - **5xx/mạng**: invalidate. Nếu số lần nộp đã tăng thì chuyển `review`.
- Thành công: chuyển `review`, xoá draft và `submitError`.
- Khi `retaking`, refetch nền không ẩn nút Submit. Nếu `canSubmit` chuyển false thì hiện lý do.
- Câu nhiều đáp án chưa pass: đánh dấu ở **mức câu**.
- Thêm `key={challenge.id}`.
- Test component:
  - Nộp lại lỗi 429: draft còn, không hiện kết quả cũ.
  - Lỗi 5xx: draft còn.
  - Thiếu câu: nhảy đúng câu.
  - Thành công: về `review`.

---

## 6. Thứ tự triển khai

| Giai đoạn | Nội dung | Phụ thuộc | Ước lượng |
|---|---|---|---|
| **P0** | Quiz (mục 5) | Không | 1–2 ngày |
| **P1** | `limits.js`, tách bucket rate limit, map 413, cap budget 120s, rút gọn kết quả, sửa sandbox server Docker | Không | 2 ngày |
| **P2** | Gói `inngest`, `lib/inngest.js`, `/api/inngest`; migration `code_runs` + outbox + `ops.dead_letters`; `dead-letter-sink`; `/api/health`; Inngest dev server trong compose `dev` | Không | 2 ngày |
| **P3** | `outbox-deliver` (2.7), cron (2.8), bỏ `setInterval`, inline SMTP và `vercel.json` crons | P2 | 2 ngày |
| **P4** | Đầu tiên: đo độ trễ event → function và CPU Sandbox mỗi ngôn ngữ. Sau đó: `code-run` (2.4, 2.5), `pickSandbox` + đổi `leaseSlot`, admission, UI Pusher/poll, cờ `CODE_EXEC_MODE` | P1, P2 | 2–3 ngày |
| **P5** | `CODE_RUNNER_POOL_SIZE` > 1, cache verdict, harness nhiều test trong một process, trang admin DLQ | P4 | Tuỳ chọn |

P0, P1 và P2 độc lập, làm song song được.

### 6.1 Dọn code và file dư thừa

Mỗi giai đoạn xoá phần nó thay thế, trong cùng PR. Không để hai đường cùng chạy lâu dài.

| Trạng thái | Xoá | Lý do |
|---|---|---|
| **Đã làm** | Các lời gọi inline `processAuthOutbox({ ids })` trong service, thay bằng `dispatchAuthOutbox(ids)` | Request không chờ SMTP nữa khi có Inngest |
| **Đã làm** | `app/api/internal/auth-outbox/route.js` | `sweeper` thay thế. Giữ `AUTH_CRON_SECRET` cho route `account-maintenance` / `exp-audit` |
| **Đã làm** | `vercel.json` | Cron chuyển sang Inngest. Route `/api/internal/*` giữ để chạy tay |
| **Đã làm** | `runCodingSamples` (service + action) | Run trên server đi qua `queueCodeRun(kind: "manual")` |
| **Đã làm** | Hằng số budget trùng lặp ở `codeRunner.js` / `vercelRunner.js` | Gom vào `lib/challenges/limits.js` |
| Sau khi P3/P4 chạy ổn 2 tuần | `ensureAuthOutboxWorker`, `AUTH_OUTBOX_WORKER`, cờ `OUTBOX_DELIVERY` / `CODE_EXEC_MODE`, nhánh chấm inline trong `queueCodeRun` | Chỉ giữ một đường. Dev dùng Inngest dev server |
| Khi bỏ chấm bằng trình duyệt ở dev | `startCodingSubmission` / `finishCodingSubmission` (cùng action, mutation), `challenge:pending:*`, `PENDING_SUBMISSION_TTL_SEC` | Lúc đó mọi môi trường đều có code runner |
| Giữ | Vòng thử 2 slot trong `vercelRunner.js`, `MAX_QUEUE` của `sandbox/server.mjs` | Lớp bảo vệ thứ hai khi `concurrency` của Inngest cấu hình sai |

Trước khi xoá bất cứ hàm nào, grep toàn bộ nơi gọi, kể cả `__tests__/`.

## 7. Quyết định còn mở

1. **Gói Vercel và Inngest trước khi mở cho nhiều người dùng.**
   - Vercel Hobby: Sandbox 5 giờ CPU/tháng, function 300s.
   - Inngest Free: 50k execution/tháng, 5 step đồng thời.
   - Cả hai đều **dừng hẳn** khi hết hạn mức.

## 8. Rủi ro

- **Phụ thuộc Vercel + Inngest:**
  - Inngest gặp sự cố: job `queued` và outbox nằm yên trong Postgres, sweeper gửi lại khi hồi phục. Có thể chuyển `CODE_EXEC_MODE=sync`.
  - Vercel Sandbox hết hạn mức: chấm bài dừng, `onFailure` hoàn lượt.
- **At-least-once:** step có thể chạy lại, sandbox có thể chạy trùng một job (vô hại). Email có thể trùng trong trường hợp hiếm.
- **Resume sandbox sau khi ngủ** làm lần chạy đầu chậm. Đo ở P4. Nếu chậm khó chấp nhận, giữ sandbox ấm trong giờ cao điểm.
- **Đã kiểm chứng (2026-10-30):** cú pháp `priority.run`, các event `inngest/function.failed`/`cancelled` (xem mục Trạng thái). Còn lại: cách tính execution của gói đã chọn.

## 9. Rủi ro còn lại sau khi triển khai và hướng khắc phục

Rà lại code ngày 2026-10-31. Các mục **R1–R3** là lỗi có thể gây ngừng dịch vụ, cần sửa trước khi bật Inngest trên production.

**Đã sửa (2026-10-31):** R1, R2, R3, R5, R6, R8, R10, kèm test:

- `__tests__/learning/codeRun.integration.test.js`: hết hạn tại chỗ, ân hạn cho job đang chạy, `load()` bỏ qua run hết hạn.
- `__tests__/sandbox/limits.test.js`: sức chứa hàng đợi.
- `__tests__/auth/inngestEnv.test.js`: kiểm tra env khi khởi động.

Khác với hướng ban đầu:

- **R1:** không tách `timeouts.start` theo loại run. Run quá hạn được đóng ngay khi gặp: lúc execute, lúc poll, lúc tạo run mới, và khi `sweeper` quét (`codeRunDb.expire*`). Job đang `running` có thêm 150 giây ân hạn, để một job bắt đầu sát deadline vẫn chạy xong.
- **R3:** sức chứa = `queueCapacity()` (`lib/challenges/limits.js`), tính theo deadline của từng loại run và `avg_job_sec` của 10 phút gần nhất.

Còn lại: R4, R7, R9, R11–R15.

### Cao

**R1. Run quá hạn bị kẹt ở `queued`, chặn cả user lẫn toàn hệ thống**

- **Hiện tượng:**
  - Run sample có `deadline_at = now()+45s`, nhưng `timeouts.start` của `code-run` là 3 phút.
  - Khi hàng đợi chậm, function bắt đầu sau deadline: `codeRunDb.start()` trả `null`, và `executeCodeRun` (`services/challenge.service.js:949-951`) chỉ đọc lại trạng thái rồi thoát. Row vẫn `queued` cho tới khi `sweeper` chạy, chậm nhất là deadline + 2 phút + 10 phút.
- **Hậu quả:**
  - Unique index `uq_code_runs_user_active` khiến user đó không chạy hay nộp được gì trong ~12 phút.
  - Client ngừng poll sau 6 phút, báo "taking longer than usual".
  - `codeRunDb.load()` (`db/codeRun.db.js:116`) tính `oldest_wait_sec` cả trên run đã quá hạn. Chỉ một run kẹt cũng đủ làm admission trả 503 "not responding" cho **mọi** user.
- **Khắc phục:**
  1. Hết hạn tại chỗ: thêm `codeRunDb.expire({ publicId })`, chuyển `queued` → `cancelled` và `running` → `timeout` khi `deadline_at < now()`. Gọi nó ở:
     - `executeCodeRun` khi `start()` trả `null`;
     - `getCodeRun` (lần poll đầu sau deadline đóng run luôn);
     - `queueCodeRun` trước khi insert, cho run cũ của chính user đó.
  2. Admission chỉ tính run còn hạn: `MIN(queued_at) FILTER (WHERE status = 'queued' AND deadline_at > now())`.
  3. Cho `timeouts.start` bằng deadline của từng loại: `manual` chỉ chờ tối đa ~45 giây. Có thể tách function `code-run` theo `kind`, hoặc giữ một function và dựa vào bước 1.
  4. Test: run với `deadlineSec: -1` gọi `executeCodeRun` thì chuyển `cancelled`; user đó tạo run mới được ngay; `load()` không đếm run đã hết hạn.

**R2. `INNGEST_DEV` trên production tắt kiểm tra chữ ký**

- **Hiện tượng:** ở chế độ dev, `serve()` nhận request không có chữ ký. Nếu biến này lọt vào env production, ai cũng gọi được `/api/inngest` để chạy các step. Ví dụ: huỷ run của người khác, chạy `account-maintenance` nhiều lần (gửi email nhắc lặp lại).
- **Khắc phục:** trong `lib/envCheck.mjs`, khi production:
  - `INNGEST_DEV` có giá trị: đưa vào `fatal`.
  - Thiếu `INNGEST_SIGNING_KEY` trong lúc có `INNGEST_EVENT_KEY`: đưa vào `errors`.
  - Thêm test cho cả hai.

**R3. Giới hạn hàng đợi không gắn với năng lực xử lý**

- **Hiện tượng:** `MAX_ACTIVE_RUNS = 200`, trong khi mỗi sandbox chỉ 2 slot. Với job ~5 giây, 200 run cần ~500 giây, quá `timeouts.start` 3 phút. Phần lớn sẽ bị huỷ sau khi đã chờ, tốn lượt gửi event và làm người dùng khó chịu.
- **Khắc phục:**
  - Tính giới hạn theo năng lực: `maxQueued = tổng slot × floor(deadline / avgJobSec)`.
    - `avgJobSec` lấy trung bình 10 phút gần nhất từ `finished_at - started_at`; tối thiểu 3 giây.
    - Ví dụ: 2 slot × 180 / 5 ≈ 72.
  - Trả 503 kèm `Retry-After` thật thay vì để người dùng chờ rồi mới bị huỷ.
  - Giữ `MAX_ACTIVE_RUNS` làm trần cứng.

**R4. Inngest hết hạn mức hoặc gặp sự cố: chấm bài ngừng mà không ai biết**

- **Hiện tượng:** gói Free hết 50k execution thì **dừng hẳn**. Event vẫn được nhận nhưng không chạy, run nằm `queued` tới deadline. Email cũng không gửi.
- **Khắc phục:**
  1. Nâng gói trước khi mở cho người dùng thật.
  2. `/api/health` báo `degraded` khi có run còn hạn chờ quá 60 giây (`oldestQueuedSec`). Gắn uptime monitor bên ngoài (UptimeRobot, Better Stack…) vào `/api/health` để có cảnh báo.
  3. Tự fallback: nếu `inngest.send` của `queueCodeRun` lỗi, chấm inline trong request (đường `CODE_EXEC_MODE=sync` đã có) thay vì để run nằm chờ sweeper.

**R5. Thứ tự deploy**

- **Hiện tượng:**
  - Code mới đọc/ghi các cột của migration `20261030_001`. Deploy trước khi migrate thì Run/Submit trả 500.
  - `vercel.json` đã bị xoá: chưa đặt key Inngest thì cron hằng ngày không chạy.
- **Khắc phục:** thêm vào checklist ở README, theo đúng thứ tự:
  1. `npm run db:migrate:prod -- --yes`, rồi `npm run db:compare` báo "in sync".
  2. Đặt `INNGEST_EVENT_KEY` và `INNGEST_SIGNING_KEY` trên Vercel (hoặc dùng tích hợp Inngest–Vercel).
  3. Deploy.
  4. Kiểm tra app đã sync trên dashboard Inngest và `/api/health` có `jobs.inngest: true`.

### Trung bình

**R6. Poll không có rate limit, tải tăng theo số người đang chờ**

- **Hiện tượng:**
  - `getCodeRunAction` không có limiter. Mỗi lần poll gồm một lần đọc session và hai query (`get` + `position`).
  - 200 run chờ, poll 1,5 giây/lần ≈ 130 request/giây.
- **Khắc phục:**
  - Thêm limiter `codeRunPoll` 120/phút cho mỗi user.
  - Client giãn nhịp: 1,5 giây trong 20 giây đầu, sau đó 3 giây.
  - Chỉ tính `position` khi `status = 'queued'` (đã đúng). Có thể bỏ hẳn khi vượt 50.

**R7. Bảng `code_runs` phình theo số lần bấm Run**

- **Hiện tượng:** mỗi lần Run lưu code (≤ 64 KB) và kết quả (≤ 256 KB) vĩnh viễn. 1.000 lần/ngày × ~50 KB ≈ 50 MB/ngày trên Neon.
- **Khắc phục:** thêm bước dọn vào `sweeper`, giới hạn 500 row mỗi lần:
  - Xoá run `manual` đã kết thúc quá 7 ngày.
  - Với run `submit` quá 30 ngày: bỏ `source_snapshot.code` (code đã nằm trên S3) và các trường `actual`/`output`/`error` trong `result.graded`.

**R8. Nhánh thử lại của finalize bỏ qua việc xoá cache**

- **Hiện tượng:** khi `finalizeCodeRun` thấy submission đã được chấm (một lần thử trước dừng giữa chừng), nó không gọi `afterSubmission`. Điểm và tiến độ trên UI cũ đi cho tới khi cache hết hạn (2–5 phút), và không có sự kiện Pusher.
- **Khắc phục:** ở nhánh đó gọi `invalidateUserCache(userId)` và `publishToUser(CHALLENGE_SUBMITTED)` với `rewards` rỗng.

**R9. Throttle outbox dùng chung cho mọi loại event**

- **Hiện tượng:** `throttle 10/phút` áp lên cả `storage.purge` và `email.*`. Một đợt nhiều đăng ký sẽ làm việc xoá file của tài khoản bị purge chậm theo email.
- **Khắc phục:**
  - Gửi kèm `kind` trong event `outbox/created`, lấy `throttle.key = "event.data.kind"`.
  - Hoặc tách hẳn `email-deliver` (có throttle) khỏi `outbox-deliver` (không throttle).
  - Theo dõi thêm giới hạn ~500 thư/ngày của Gmail: vượt mức thì email rơi vào dead letter.

**R10. Container app (Docker) lệch concurrency với sandbox**

- **Hiện tượng:** `sandboxSlots()` đọc `CODE_RUNNER_CONCURRENCY`. Service `app` trong `compose.yml` không truyền biến này, chỉ `sandbox` nhận nó dưới tên `MAX_CONCURRENCY`. Nếu `.env.production` không đặt, hai bên có thể lệch nhau: sandbox trả 503 và bị retry thừa.
- **Khắc phục:** thêm `CODE_RUNNER_CONCURRENCY: ${CODE_RUNNER_CONCURRENCY:-2}` vào `environment` của `app`.

### Thấp

| Mã | Rủi ro | Khắc phục |
|---|---|---|
| R11 | Vercel Sandbox Hobby (5 giờ CPU/tháng) hết hạn mức: không tạo được sandbox, các run thất bại sau retry | Đo CPU theo ngôn ngữ (đã ghi ở 4.3), nâng gói Pro trước khi mở rộng, tăng `CODE_RUNNER_POOL_SIZE` khi tải tăng |
| R12 | `priority` cho Run (+60 giây) có thể làm Submit chờ lâu khi tải cao | Giảm xuống +20 giây, hoặc dành riêng 1 slot cho `submit` (concurrency key theo `kind`) |
| R13 | Cài thêm gói npm phải dùng `--force` (xung đột peer tuỳ chọn `@sveltejs/kit` của `inngest`) | Ghi vào README. Không thêm `legacy-peer-deps` toàn cục, vì nó che các xung đột thật |
| R14 | Dev server Inngest trong compose lưu trong bộ nhớ, `host.docker.internal` khác nhau giữa các OS | Đã ghi trong `docs/docker.md`. Linux thêm `extra_hosts` |
| R15 | Email có thể gửi trùng (crash giữa lúc SMTP trả 250 và lúc ghi `processed_at`) | Chấp nhận. Nếu cần: dùng `Message-ID` cố định theo outbox id để client mail gộp thư trùng |

### Thứ tự sửa đề xuất

1. R1, R2, R3, R5 (cùng một PR, kèm test).
2. R6, R8, R10 (vài dòng mỗi mục).
3. R4 (uptime monitor + fallback inline), R7 (retention), R9.
4. Theo dõi R11, R12 sau khi có số liệu tải thật.

**Nguồn:**

- [Inngest Pricing](https://www.inngest.com/pricing)
- [Inngest Usage Limits](https://www.inngest.com/docs/durable-execution/limits)
- [Inngest Concurrency](https://www.inngest.com/docs/durable-execution/flow-control/concurrency)
- [Inngest Idempotency](https://www.inngest.com/docs/guides/handling-idempotency)
- [Cancel on timeouts](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
