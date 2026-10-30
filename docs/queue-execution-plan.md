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

| Khi | Xoá | Lý do |
|---|---|---|
| P3 | `ensureAuthOutboxWorker` (`services/authOutbox.service.js:123-151`) và lệnh import khởi động nó ở `services/auth.service.js:25`; biến `AUTH_OUTBOX_WORKER` (`vitest.config.mjs:33`) | Inngest `outbox-deliver` + `sweeper` thay `setInterval` |
| P3 | Các lời gọi inline `processAuthOutbox({ ids })` ở `auth.service.js:54-56`, `emailVerification.service.js:33,48`, `accountLink.service.js:33,119,169`, `accountMaintenance.service.js:36` | Request không chờ SMTP nữa |
| P3 | `app/api/internal/auth-outbox/route.js` | `sweeper` thay thế; route này cũng chưa từng nằm trong cron. Giữ `AUTH_CRON_SECRET`, vì route `account-maintenance` / `exp-audit` vẫn dùng |
| P3 | `vercel.json` (chỉ chứa `crons`) | Cron chuyển sang Inngest. Giữ route `account-maintenance` / `exp-audit` để chạy tay |
| P4 | `challenge:pending:<subId>`, `pendingKey`, `PENDING_SUBMISSION_TTL_SEC` và logic "expired" (`services/challenge.service.js:25,305,396,746-755`) | Thay bằng `code_runs.result` và trạng thái `cancelled`/`timeout` |
| P4 | `finishCodingSubmissionAction` (`actions/challenge.actions.js`), mutation (`mutations/challenge.mutation.js`) và lời gọi phía client trong `codingChallenge.jsx`. Sửa `__tests__/learning/stdioChallenge.integration.test.js` theo luồng mới | Finalize chạy trong step `finalize` phía server |
| P4 | Đường trả 503 khi hết slot và vòng thử 2 slot trong `vercelRunner.js:119-147` | Concurrency của Inngest chặn trước; hết slot thì throw để retry |
| P4 | Hàng đợi in-memory của `sandbox/server.mjs` (`MAX_QUEUE` hạ về số slot) | Inngest đã xếp hàng |
| Sau khi P3/P4 chạy ổn 2 tuần | Cờ `OUTBOX_DELIVERY=inline`, `CODE_EXEC_MODE=sync` và code đi kèm: `claimOutbox`/`failOutbox`/backoff (`db/session.db.js:317-346`, `authOutbox.service.js:100`), chấm bài đồng bộ trong action | Chỉ giữ một đường. Dev dùng Inngest dev server |
| Mỗi giai đoạn | Cập nhật `docs/sandbox.md`, `docs/environments.md`, `.env.example` (thêm `INNGEST_*`, `CODE_RUNNER_POOL_SIZE`; bỏ `AUTH_OUTBOX_WORKER`) | Tài liệu khớp với code |

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
- **Chưa kiểm chứng bằng chạy thật:** cú pháp `priority.run`, tên event `inngest/function.failed`/`cancelled` với phiên bản SDK sẽ dùng, cách tính execution của gói đã chọn.

**Nguồn:**

- [Inngest Pricing](https://www.inngest.com/pricing)
- [Inngest Usage Limits](https://www.inngest.com/docs/durable-execution/limits)
- [Inngest Concurrency](https://www.inngest.com/docs/durable-execution/flow-control/concurrency)
- [Inngest Idempotency](https://www.inngest.com/docs/guides/handling-idempotency)
- [Cancel on timeouts](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
