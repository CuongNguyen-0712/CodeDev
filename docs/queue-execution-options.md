# CodeDev — So sánh hướng điều phối và chạy code

Cập nhật: 2026-10-30. **Quyết định: chọn Hướng B.** Thiết kế chi tiết nằm ở [queue-execution-plan.md](queue-execution-plan.md) (bản 5). Tài liệu này giữ lại để ghi lý do chọn.

Hướng A (Inngest + Execution VM) là bản 4 của plan, đã được thay thế.

Lưu ý khi đọc mục 3.5: tên biến `CODE_RUNNER_SANDBOXES=N` ở đó đã đổi thành `CODE_RUNNER_POOL_SIZE`, vì `CODE_RUNNER_SANDBOXES` đang được dùng cho override sandbox theo ngôn ngữ.

Các phần **không đổi** dù chọn hướng nào:

- PostgreSQL là durable job store: `code_runs` + `auth_outbox`, chống trùng bằng điều kiện trạng thái, `ops.dead_letters`.
- Upstash Redis giữ cho cache, rate limit, session.
- Giới hạn dung lượng, cache verdict, tách bucket rate limit.
- Toàn bộ phần Quiz (cooldown 60s, sửa luồng làm lại).

---

## 1. Dữ kiện đã kiểm tra (2026-10-30)

| Dịch vụ | Dữ kiện chính |
|---|---|
| **Inngest** | Free: 50k execution/tháng, 5 step đồng thời. Hết hạn mức thì dừng thực thi. Function chạy **trong app của mình** (`serve()` trên Vercel) hoặc trên worker riêng (`connect()`). Có concurrency theo key, idempotency 24h, throttle, cron |
| **Trigger.dev v4** | Task chạy trên **máy của Trigger.dev**, không bị timeout serverless. Free: $5 credit compute/tháng, 20 run đồng thời (production), 10 kết nối Realtime. Tính tiền theo giây đang chạy + $0.000025/run. Lúc `wait` không bị tính tiền và không chiếm concurrency. `concurrency` có `perKey`/`total` (v4.7). Tích hợp Vercel: đồng bộ env hai chiều, chống lệch phiên bản giữa task và app |
| **Vercel Functions** | Fluid compute: Hobby tối đa 300s; Pro mặc định 300s, tối đa 800s |
| **Vercel Sandbox** | Firecracker microVM, dành cho code không tin cậy. Hobby: 10 sandbox đồng thời, 5 giờ Active CPU/tháng, 5.000 lần tạo/tháng; vượt thì **tạm dừng**. Pro: 10.000 đồng thời, tính theo dùng. Dự án **đã dùng** (`lib/challenges/vercelRunner.js`, `codedev-runner-v4`) |
| **Vercel Queues / Workflow DevKit** | Queues: public beta từ 2026-02-27, $0.60/1M thao tác. Workflow (`"use workflow"` / `"use step"`): chưa xác nhận đã GA |

---

## 2. So sánh

| Tiêu chí | **A. Inngest + Execution VM** (plan v4) | **B. Inngest + Vercel Sandbox** | **C. Trigger.dev + Vercel Sandbox** | **D. Vercel Workflow/Queues + Sandbox** |
|---|---|---|---|---|
| Dịch vụ thêm | Inngest + VM tự vận hành | Inngest | Trigger.dev | Không (cùng Vercel) |
| Ai cách ly code học viên | **Mình** (Docker sandbox trên VM) | Vercel (microVM) | Vercel (microVM) | Vercel (microVM) |
| Server phải vận hành | VM: vá lỗi, giám sát, TLS/kết nối | Không | Không | Không |
| Secret nằm ngoài Vercel | Signing key Inngest trên VM | Không | **Toàn bộ env được đồng bộ sang Trigger.dev** | Không |
| Giới hạn thời gian mỗi bước | Không (worker riêng) | 300s/step (Hobby), đủ cho budget 120s | Không | Như Vercel Functions |
| Backpressure | Inngest concurrency | Inngest concurrency theo sandbox | Queue `concurrency` perKey/total | Phải tự làm thêm |
| Realtime cho UI | Pusher (đã có) | Pusher | Pusher, hoặc Realtime (Free chỉ 10 kết nối) | Pusher |
| Code thay đổi | Lớn: daemon, compose VM, Connect, presigned S3 | **Nhỏ**: dùng lại `vercelRunner.js` | Vừa: build task riêng (`trigger.config`, alias `@/`), deploy riêng | Vừa; API còn beta |
| Chi phí khi tăng tải | Cố định (giá VM) | Theo CPU Sandbox | Compute Trigger.dev (cả lúc chờ sandbox) + Sandbox | Theo CPU Sandbox + thao tác Queues |
| Rủi ro chính | Tự chịu bảo mật sandbox; VM là điểm lỗi đơn | Hạn mức Hobby của Sandbox; phụ thuộc Vercel | Secret ra bên thứ ba; hai pipeline deploy | Sản phẩm beta |

### Trigger.dev có ổn hơn Inngest không?

Với dự án này thì **không**.

**Trigger.dev mạnh ở:**

- Task chạy lâu, nặng CPU **ngay trong task**.
- `wait` không tốn tiền.
- Realtime có sẵn React hook.

Ở đây cả ba điều không cần:

- Phần nặng là chạy code học viên. Phần này **không được** chạy trong task Trigger.dev, vì task có env đồng bộ từ Vercel (DB, auth secret). Nó vẫn phải gọi ra sandbox.
- Task chủ yếu chỉ chờ sandbox trả kết quả. Lúc chờ HTTP vẫn tính compute, khác với `wait`.
- Budget chấm bài đã cap 120s, nằm trong giới hạn 300s của Vercel Functions.
- Pusher đã có cho realtime. Realtime của Trigger.dev bản Free chỉ cho 10 kết nối.

**Cái giá phải trả nếu chọn Trigger.dev:**

- Thêm một pipeline build/deploy cho code task (phải bundle `services/` và `db/` với alias `@/`).
- Đưa toàn bộ secret sang một bên thứ ba.

### Tích hợp Vercel có tốt hơn không?

Cả Inngest và Trigger.dev đều có tích hợp Vercel (đồng bộ key/env, tự sync khi deploy). **Tích hợp không phải yếu tố quyết định.**

Khác biệt nằm ở chỗ **code chạy ở đâu**:

- Inngest chạy function trong chính app Next.js, cùng deploy, cùng env.
- Trigger.dev chạy trên hạ tầng riêng, phải đồng bộ env sang.

Muốn ít nhà cung cấp nhất thì là Hướng D. Nhưng Queues còn beta và chưa xác nhận Workflow đã GA, nên chưa nên dựa vào cho luồng chấm bài.

---

## 3. Đề xuất: Hướng B — Inngest + Vercel Sandbox (bỏ Execution VM)

**Lý do:**

1. Rủi ro và chi phí lớn nhất của Hướng A là **tự vận hành máy chạy code không tin cậy**. Hướng B giao phần này cho Firecracker microVM của Vercel.
2. Dự án **đã có** đường chạy qua Vercel Sandbox (`vercelRunner.js`). Điểm yếu hiện tại của nó là không có hàng đợi: slot thứ 3 nhận 503. Concurrency của Inngest giải quyết đúng điểm này.
3. Không còn daemon, Connect, signing key trên VM, presigned URL hay VM là điểm lỗi đơn. Code học viên vẫn chạy trong microVM không có secret.

### 3.1 Sơ đồ

```
Vercel (Next.js, serve() /api/inngest)                       Vercel Sandbox (microVM)
──────────────────────────────────────                       ────────────────────────
tx: code_runs(queued) ─commit─► inngest.send(code/run.requested, id=exec-<runId>)
                                        │
fn code-run (Vercel, maxDuration 300s)  ◄┘
  concurrency: [{ key: sandbox, limit: VCPUS }, { key: userId, limit: 1 }]
  step.run(execute) ─── vercelRunner (lease slot hiện có) ───► codedev-runner-v4-{i}
  step.run(finalize: tx, WHERE status='queued')
  step.run(notify: Pusher)
  onFailure ─► failed + hoàn lượt + ops.dead_letters
```

### 3.2 Khác gì so với plan v4 (Hướng A)

| Mục trong plan v4 | Hướng B |
|---|---|
| 2.1 Hai Inngest app (`codedev` + `codedev-exec`) | **Một app** `codedev` |
| 2.3 `step.invoke` sang `exec-run` trên VM | Một function `code-run`: các step `execute` → `finalize` → `notify`. **Không có `step.invoke`**, nên không còn vấn đề con chạy tiếp khi timeout |
| 2.3 Presigned S3 URL cho source/tests | Step `execute` đọc thẳng từ DB/S3 như hiện tại. Không có gì đi qua payload event ngoài `runId` |
| 2.5 Execution VM, `exec-daemon`, `connect()` | **Bỏ** |
| 2.9 Signing key trên VM | **Bỏ** |
| 3 `concurrency.limit = EXEC_SLOTS` toàn cục | `concurrency: [{ key: 'event.data.sandbox', limit: VCPUS }]`. Action gán `sandbox = i` (0…N-1) theo vòng tròn hoặc theo số job `queued` ít nhất. Mỗi microVM chỉ nhận đúng số slot vCPU của nó |
| 4.3 Bỏ `vercelRunner.js` | **Giữ**. Bỏ đường 503 khi hết slot (đổi thành throw để Inngest retry); `leaseSlot` qua Redis giữ làm lớp bảo vệ thứ hai |
| Sức khoẻ VM suy từ DB | Sandbox lỗi thì step throw, Inngest retry (2 lần), sau đó `onFailure`. Heuristic admission giữ nguyên |
| Hosting Docker (`npm run docker:app`) | `CODE_RUNNER_PROVIDER=docker`: step `execute` gọi `sandbox-gateway` như hiện tại. Inngest gọi vào `/api/inngest` của container app |

### 3.3 Cấu hình `code-run`

```js
inngest.createFunction({
  id: 'code-run',
  idempotency: 'event.data.runId',
  concurrency: [
    { key: 'event.data.sandbox', limit: VCPUS },   // = slot vCPU của mỗi microVM
    { key: 'event.data.userId', limit: 1 },
  ],
  priority: { run: "event.data.kind == 'manual' ? 60 : 0" },   // kiểm tra cú pháp với SDK
  timeouts: { start: '3m' },                       // chờ quá lâu thì huỷ, sweeper hoàn lượt
  retries: 2,
  onFailure: markFailedRefundAndDeadLetter,
}, { event: 'code/run.requested' }, async ({ event, step }) => { /* execute → finalize → notify */ })
```

Route `app/api/inngest/route.js` đặt `export const maxDuration = 300`. Budget chấm bài cap 120s, nên luôn nằm gọn trong một step.

### 3.4 Hạn mức cần theo dõi

- **Vercel Sandbox Hobby:** 5 giờ Active CPU/tháng, vượt thì **tạm dừng tạo sandbox**. Ví dụ, một lần chấm tốn ~3s CPU thì được khoảng 6.000 lần/tháng. Cần đo CPU thật mỗi ngôn ngữ (Kotlin/Java nặng hơn nhiều).
- **Inngest Free:** 50k execution/tháng, 5 step đồng thời. Concurrency tổng của các function phải ≤ 5 (ví dụ: `code-run` 2–4, `outbox-deliver` 1).
- Cả hai đều **dừng hẳn** khi hết hạn mức (không tính vượt mức), nên nâng gói trước khi mở cho nhiều người dùng.

### 3.5 Thứ tự triển khai (thay P4 của plan v4)

| Giai đoạn | Nội dung |
|---|---|
| P0–P3 | Như plan v4 (Quiz, limits/rate limit, hạ tầng Inngest, outbox) |
| **P4-B** | Function `code-run` (execute dùng `vercelRunner`/`codeRunner` hiện có); action chỉ insert `code_runs` + `inngest.send`; gán `sandbox` theo vòng tròn; Pusher/poll; cờ `CODE_EXEC_MODE=sync|queue`; đo CPU Sandbox mỗi ngôn ngữ |
| P5 | Tăng số microVM theo tải (`CODE_RUNNER_SANDBOXES=N`), cache verdict, harness nhiều test trong một process |

Ước lượng P4-B: 2–3 ngày, thay cho 4–5 ngày của P4 Hướng A.

### 3.6 Khi nào nên quay lại Hướng A

- Chi phí CPU của Vercel Sandbox vượt giá một VM cố định với tải thực tế.
- Cần ngôn ngữ hoặc toolchain mà snapshot Vercel Sandbox không cài được.
- Cần chạy ngoài Vercel hoàn toàn (đã có đường Docker, nhưng chưa có hàng đợi riêng).

---

## Nguồn

- [Inngest Pricing](https://www.inngest.com/pricing)
- [Inngest Usage Limits](https://www.inngest.com/docs/durable-execution/limits)
- [Trigger.dev Pricing](https://trigger.dev/pricing)
- [Trigger.dev Limits](https://trigger.dev/docs/limits)
- [Trigger.dev v4.7.0](https://trigger.dev/changelog/v4-7-0)
- [Trigger.dev Vercel integration](https://trigger.dev/docs/vercel-integration)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
- [Vercel Queues concepts](https://vercel.com/docs/queues/concepts)
- [Workflow DevKit](https://vercel.com/blog/introducing-workflow)
