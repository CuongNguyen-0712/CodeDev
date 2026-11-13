# Runbook đo khả năng chịu tải

Thiết kế: [`docs/superpowers/specs/2026-11-13-load-capacity-design.md`](../superpowers/specs/2026-11-13-load-capacity-design.md). Tài liệu này là cách vận hành bộ công cụ k6 đã dựng: chuẩn bị dữ liệu, chạy local, chạy pha Vercel, đọc báo cáo.

Kết quả mỗi lần chạy nằm ở `tests/loadtest/runs/<yyyymmdd-hhmm>-<env>-<profile>/` (git-ignored); báo cáo `docs/loadtest/<yyyy-mm-dd>-<env>-<profile>.md` thì commit.

## 0. Thành phần

| Thứ | Vai trò |
|---|---|
| `compose.loadtest.yml` | overlay trên `compose.yml`: `postgres-load` (Postgres 16, 1 CPU / 4 GB, `pg_stat_statements`, `max_connections=225`), `k6`, giới hạn app 1 CPU / 2 GB, bật remote-write cho Prometheus |
| `.env.loadtest` (git-ignored) | từ `.env.loadtest.example`; compose đọc qua `--env-file`, app đọc làm env file |
| `npm run load:compose -- <args>` | `docker compose -f compose.yml -f compose.loadtest.yml --env-file .env.loadtest <args>` |
| `npm run load:seed` | seed user `lt_*` (`scripts/loadtest/seed.mjs`) |
| `npm run load:sessions` | mint session bằng đăng nhập HTTP thật (`sessions.mjs`) |
| `npm run load:actions` | đọc `server-reference-manifest.json`, ghi `tests/loadtest/actions.json` |
| `npm run load:run` | chạy trọn một lần: reset DB, bật app, mint session, sampler, k6, snapshot, báo cáo |
| `loadtest/k6/` | `main.js` (profile `smoke\|stress\|soak\|spike`), `coderun.js`, 4 hành trình |
| `monitoring/grafana/dashboards/codedev-loadtest.json` | dashboard k6 |

Các điều đã chốt khi dựng (đọc trước khi sửa cấu hình):

1. **App local chạy `APP_ENV=development` + `LESSON_CONTENT_SOURCE=sanity`, không phải `staging`.** `lib/envCheck.mjs` coi staging là lỗi chết khi dùng MinIO/storage local và `NEXTAUTH_URL` http. Staging thật chỉ đo ở pha Vercel.
2. **Session lấy bằng đăng nhập HTTP thật**, không tự mã hoá JWT. Session dùng một lần sau khi refresh, nên `load:run` mint session mới mỗi lần. Số session ≤ số user đã seed; mỗi VU giữ đúng một session (k6 ném lỗi nếu thiếu).
3. **Khách không thấy ranking** (`/ranking`, `/api/ranking` cần đăng nhập): ranking nằm trong hành trình học viên.
4. **Server action cần `x-forwarded-host` bằng host của `ORIGIN`** (Next so `Origin` với `Host`). `ORIGIN` mặc định `http://localhost:3000`.
5. **Cổng host**: app theo `APP_PORT` (máy này đặt 3100 vì dev server giữ 3000); `postgres-load` theo `POSTGRES_LOAD_PORT` (mặc định 5433, máy này 5435). Script đọc cổng từ env file.
6. **Docker build app cần `BUILD_DATABASE_URL`** (bước prerender đọc DB). `compose.loadtest.yml` trỏ vào `loadtest_base` qua `host.docker.internal`; trên Linux thêm `extra_hosts: ["host.docker.internal:host-gateway"]`. Không bao giờ truyền credential thật vào build arg này.
7. **Prometheus remote-write**: `run.mjs` chỉ dùng khi container `prometheus` có `--web.enable-remote-write-receiver`, tức là monitoring bật bằng `npm run load:compose -- --profile monitoring up -d prometheus grafana` (không phải `npm run monitoring:up`).
8. **N tính trên cửa sổ giữ 110 s** của mỗi bậc 2 phút (10 s ramp đầu bị bỏ), ngưỡng nghiêm ngặt (`< 800` / `< 1 500` ms / `< 1%`), điểm sau bậc cuối (đuôi `gracefulStop`) bị bỏ.
9. **Bước Neon làm tay, mỗi bước cần chủ dự án đồng ý.** Agent không chạy.

## 1. Chuẩn bị dữ liệu

### 1a. Chỉ local (không cần Neon)

Cách dùng cho lần đo đầu: seed thẳng vào `loadtest_base` trên `postgres-load`.

```bash
cp .env.loadtest.example .env.loadtest      # điền chỗ trống
npm run load:compose -- --profile loadtest up -d postgres-load
```

Dựng `loadtest_base` từ đầu (chỉ khi DB chưa có):

```bash
# CREATE DATABASE + extension
npm run load:compose -- exec -T postgres-load psql -U postgres -c "CREATE DATABASE loadtest_base"
npm run load:compose -- exec -T postgres-load psql -U postgres -d loadtest_base -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
# schema: db/schema.sql do pg_dump 18 tạo, PG16 không biết `SET transaction_timeout`
grep -v '^SET transaction_timeout' db/schema.sql | npm run load:compose -- exec -T postgres-load psql -U postgres -d loadtest_base -v ON_ERROR_STOP=1
# migration tới mới nhất (đặt DATABASE_URL trỏ loadtest_base qua cổng host)
DATABASE_URL="postgres://postgres:<POSTGRES_LOAD_PASSWORD>@localhost:<POSTGRES_LOAD_PORT>/loadtest_base" node db/tools/migrate.mjs --yes
```

Seed (app phải dừng: `npm run load:compose -- --profile app stop app`):

```bash
npm run load:seed -- --env .env.loadtest --users 5000 --reset
```

`load:seed` chỉ bootstrap 3 khoá miễn phí (`db/seeds`) và roadmap trên DB local tên `loadtest*`. Mỗi user: tài khoản đã xác thực, 3 khoá đăng ký, 20 dòng exp, 10 dòng point, bạn bè (đã nhận + đang chờ), 3 hội thoại x 20 tin. Các tỷ lệ này là giả định; báo cáo ghi lại. Seed ghi `tests/loadtest/users.json`. `--reset` xoá user `lt_*` cũ trước. Script từ chối DB không local, không bắt đầu bằng `loadtest`, hay trùng `DATABASE_URL` của `.env.production`/`.env.local`.

### 1b. Từ Neon `loadtest` (làm tay, hỏi chủ dự án từng bước)

1. Tạo nhánh `loadtest` từ `develop` (Neon console). Đặt compute max 1 CU.
2. Migration trên nhánh đó: `DATABASE_URL=<loadtest url> node db/tools/migrate.mjs --yes`.
3. `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`
4. Seed: `npm run load:seed -- --env .env.loadtest --url <loadtest url> --yes`.
5. Dump: `npm run load:compose -- exec postgres-load pg_dump "<loadtest url>" -Fc -f /dumps/base.dump` (thư mục `/dumps` = `tests/loadtest`).
6. Restore vào `loadtest_base`:
   ```bash
   npm run load:compose -- exec postgres-load dropdb -U postgres --if-exists loadtest_base
   npm run load:compose -- exec postgres-load createdb -U postgres loadtest_base
   npm run load:compose -- exec postgres-load pg_restore -U postgres --no-owner -d loadtest_base /dumps/base.dump
   ```

Mỗi lần chạy `run.mjs` tự `DROP DATABASE loadtest_run; CREATE DATABASE loadtest_run TEMPLATE loadtest_base`, nên `loadtest_base` không bao giờ bị ghi bởi tải.

## 2. Chạy local

Trước khi chạy:

- **Inngest**: chỉ chế độ `inline` được hỗ trợ (`--inngest inline`). Trong `.env.loadtest` để trống `INNGEST_DEV` và `INNGEST_EVENT_KEY`, tuyệt đối không đặt event key thật. `run.mjs` từ chối `--inngest server` và từ chối env file có một trong hai biến. Chế độ server chưa hỗ trợ vì service `inngest` trong `compose.yml` gọi `host.docker.internal:3000` (server dev của bạn, không phải container app tải) và `INNGEST_DEV` trong container app trỏ `localhost:8288`, nơi không có gì chạy. Giá trị ghi vào `meta.json` và báo cáo.
- **Lesson trên Sanity**: các khoá đã seed phải có lesson trên dataset mà `.env.loadtest` trỏ tới. Mở thử một `/learning/<id>?lesson=<lesson>` bằng một session (body không rỗng) rồi mới chạy.
- App phải dừng khi seed lại `loadtest_base`; `run.mjs` tự dừng app, tạo lại `loadtest_run`, bật lại app.
- Trong Git Bash, chạy k6 tay cần `MSYS_NO_PATHCONV=1`.

Thứ tự:

```bash
# 1. smoke: 5 VU, 1 phút, mọi check phải pass (lần đầu thêm --build)
npm run load:run -- --env .env.loadtest --profile smoke --inngest inline --build

# 2. stress: +50 VU mỗi 2 phút tới --max-vus hoặc tới khi ngưỡng abort; tối đa ~2 giờ ở 3000
npm run load:run -- --env .env.loadtest --profile stress --inngest inline --max-vus 3000 --sessions 3000

# 3. soak: giữ 70% N, 30 phút (--n bắt buộc: N đo bởi stress)
npm run load:run -- --env .env.loadtest --profile soak --inngest inline --n <N>

# 4. spike: 0 -> 2N trong 30 s, giữ 2 phút
npm run load:run -- --env .env.loadtest --profile spike --inngest inline --n <N>
```

`--sessions` mặc định bằng số VU đỉnh của profile; không được vượt số user đã seed hay thấp hơn đỉnh. Mint 3 000 session mất nhiều phút, bình thường. `--yes` chỉ cần khi `LOADTEST_DATABASE_URL` không local.

Stress dừng sớm khi `failed_requests` vượt 20% (sau 2 phút đánh giá). Thất bại ở bước nào thì thư mục run vẫn được giữ; Ctrl+C lưu phần đã đo.

Giám sát (tuỳ chọn): `npm run load:compose -- --profile monitoring up -d prometheus grafana`, dashboard `codedev-loadtest` trên Grafana. Chạy trước `load:run` để `meta.prometheus` là `true`.

Code runner: `coderun.js` đo admission, hàng đợi và poll của app, không đo sức chịu của sandbox thật. Refresh token chỉ dùng một lần nên `sessions.json` của một `load:run` dài hơn 15 phút đã bị thu hồi: mint lại trước (`K` ≥ số VU đỉnh của coderun) rồi chạy tay (cần `actions.json` từ một lần `load:run`):

```bash
npm run load:sessions -- --env .env.loadtest --base http://localhost:<APP_PORT> --count <K>
MSYS_NO_PATHCONV=1 npm run load:compose -- run --rm -e MAX_RATE=3 k6 run /scripts/k6/coderun.js
```

## 3. Pha Vercel Preview

Chỉ bắt đầu khi pha local đã có N và các nút thắt lớn đã ghi lại. Mọi bước dưới đây cần chủ dự án đồng ý.

Danh sách kiểm tra (§5.8 spec), ghi kết quả vào báo cáo:

- 8 dịch vụ tách khỏi production: Upstash, Pusher/Beams, AgentMail/Gmail, Cloudinary, bucket S3, Inngest, Sanity dataset, Vercel Sandbox. Dịch vụ nào dùng chung thì dừng và hỏi.
- `DATABASE_URL` của deployment trỏ nhánh Neon `loadtest-run-<yyyymmdd-hhmm>` (con của `loadtest`, xoá sau khi chạy). Dùng git branch riêng, đặt `DATABASE_URL` theo branch trên Vercel, xác nhận bằng `/api/health` rằng deployment nối đúng host trước khi chạy. Không xác nhận được thì dừng.
- Vùng `iad1`, cùng vùng Neon `us-east-1`.
- Ước lượng chi phí (invocation, băng thông, lệnh Upstash, tin Pusher) cho profile định chạy.
- Deployment Protection và firewall của Vercel cho máy k6 đi qua. Không thêm cơ chế bypass rate limit vào app. Khách bị rate limit theo IP thật của máy k6: giảm tỷ lệ khách hoặc chấp nhận 429 (báo cáo đếm riêng).

Session: chạy app local với `.env.loadtest-vercel` (cùng `NEXTAUTH_SECRET` và `NEXTAUTH_URL` của preview, `DATABASE_URL` = nhánh run), rồi `load:sessions` vào app local đó. Tên cookie sẽ là bản `__Secure-`/`__Host-` vì `NEXTAUTH_URL` là https. `actions.json` phải lấy từ chính build của deployment preview.

Code runner thật: `coderun.js` với `MAX_RATE` nhỏ. Chưa có cờ `--max-runs`; trần số run bằng tổng `rate x 120 s` qua các bậc (`MAX_RATE=3` cho khoảng 720 run), ghi con số trần vào báo cáo trước khi chạy vì mỗi run tốn tiền.

## 4. Đọc báo cáo

`run.mjs` gọi `report.mjs` ở bước cuối (cả khi k6 thoát 99 do ngưỡng). Chạy lại tay: `node scripts/loadtest/report.mjs tests/loadtest/runs/<run>`. File không bao giờ bị ghi đè (thêm hậu tố `-2`).

- **Capacity (N)**: số VU cao nhất mà mọi bậc tới đó đều đạt cả ba ngưỡng; kèm lý do bậc đầu tiên gãy. `N = none` nghĩa là bậc đầu đã gãy. Nếu không bậc nào gãy, báo cáo ghi chưa gãy tới `MAX_VUS`: N chỉ là cận dưới.
- **Bảng bậc**: p95 đọc/ghi, số request, tỷ lệ lỗi, số 429. 429 không là lỗi nhưng được đếm. Bậc cuối bị cắt giữa chừng (đo được < 90% của 110 s hold) ghi `partial`: nó có thể là bậc gãy nhưng không bao giờ đặt N.
- **Bottleneck endpoints**: endpoint có p95 vượt 2x ngưỡng của lớp mình ở N (hoặc bậc gãy).
- **Run validity**: lần chạy **không hợp lệ** khi máy chạy k6 có cửa sổ 1 phút nào CPU trung bình > 80%: N khi đó bị giới hạn bởi máy tải, không phải app. Chạy lại (đóng bớt ứng dụng, giảm `--max-vus`) và không dùng con số đó.
- **Top 10 queries**: `pg_stat_statements` theo tổng thời gian trong `loadtest_run`.
- **Resources**: đỉnh CPU/RAM app và DB, connection theo trạng thái, hàng đợi (outbox, `code_runs`).
- **Assumptions**: số dữ liệu seed, tỷ lệ hành trình, kiểu Inngest, commit.

Nút thắt đầu tiên là chỗ tài nguyên chạm trần trước (CPU app 1 vCPU, CPU DB 1 vCPU, pool, một query), đối chiếu bảng Resources với endpoint chậm nhất.

## 5. Lần stress local đầu (2026-11-14)

Báo cáo: [`2026-11-14-loadtest-stress.md`](2026-11-14-loadtest-stress.md). 5 000 user seed vào `loadtest_base` (224 s), 3 000 session mint trước khi chạy, app `development` + Inngest `inline`, commit `f8379d48`.

- **N = none**: bậc 0 (50 VU) đã gãy (read p95 10 016 ms). Bậc 1 (100 VU) chỉ đo được 50 trong 110 s hold nên báo cáo ghi `partial` và nó không bao giờ đặt N. `failed_requests` vượt 20% nên k6 dừng: cửa sổ k6 đo chỉ ~3 phút (18:21:19 tới 18:24:19 UTC); ~8 phút 44 s là cả `load:run` (reset DB, khởi tạo 3 000 VU, mint session, đo, snapshot). Con số này nghĩa là app trên DB 1 CPU với 5 000 user không giữ nổi 50 VU, không phải N thật.
- **Nút thắt đầu tiên**: pool pg của app (tối đa 10 kết nối, `lib/db.js:41`) bị cạn, nhiều khả năng do truy vấn ranking chậm (`getStanding`, `WITH me AS ...`) giữ kết nối 25–28 s mỗi lần; CPU DB chạm trần 1 vCPU (đỉnh 106%, app 97%) là yếu tố góp phần. Bằng chứng: sampler DB thấy `active` kẹt ở 11 (một lần 12) suốt cửa sổ đo, tức pool 10 + 1 của sampler; 13 endpoint đọc có p95 = 10 005–10 077 ms ≈ `DB_CONNECT_TIMEOUT_MS` 10 000 (`lib/db.js:42`), là request chờ kết nối tới hết hạn; lỗi là 500 (374) và 503 (24 response). `/api/ranking` p95 30 051 ms là timeout client 30 s của k6 (status 0, 24 request), không phải thời gian server. Đây là giả thuyết, chưa xác nhận: cần kế hoạch truy vấn ranking (`EXPLAIN (ANALYZE, BUFFERS)`) trên 5 000 user; `pg_stat_statements` bỏ sót câu lệnh bị huỷ nên chỉ thấy 2 lần gọi ranking (25 508 và 28 612 ms). `learning_progress()` là truy vấn nặng thứ hai (180 ms mean, 73 lần).
- **Cờ INVALID đã được sửa**: `runValidity` giờ chỉ tính CPU máy tải trong cửa sổ k6 đo (từ điểm k6 đầu tiên tới điểm cuối), bỏ giai đoạn khởi tạo 3 000 VU. Báo cáo tính lại ghi hợp lệ (CPU máy tải tối đa 26,7% theo phút), nên kết luận N = none ở bậc 50 VU là đáng tin.
- Lần chạy kế tiếp nên dùng `--max-vus` nhỏ hơn (khởi tạo k6 với 3 000 VU tốn CPU máy tải) hoặc sửa nút thắt ranking trước.
