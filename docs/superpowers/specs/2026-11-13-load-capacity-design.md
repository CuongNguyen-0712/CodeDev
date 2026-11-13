# Đo khả năng chịu tải — thiết kế

Date: 2026-11-13. Status: chờ duyệt.

## 1. Mục đích

Cần trả lời: **hệ thống phục vụ được bao nhiêu người dùng hoạt động đồng thời mà vẫn ổn**, kèm metric chứng minh con số đó và chỉ ra chỗ gãy đầu tiên (DB, pool, Redis, code runner, CPU app...).

Hiện trạng:

- Test: 183 file Vitest trong `__tests__/`, phần lớn integration trên một DB local (`fileParallelism: false`), Redis/Pusher/Inngest thay bằng in-memory. Không có CI, E2E, load test hay benchmark.
- `docs/performance-plan.md` Phase 0 (đo baseline bằng `pg_stat_statements`) chưa làm.
- Monitoring: `compose.yml` profile `monitoring` có Prometheus + Grafana + blackbox, mới chỉ probe uptime.
- Production: Vercel + Neon (`production`, max 1 CU) + Upstash + Pusher + Cloudinary.
- Neon nhánh `develop` (`br-falling-breeze-a4fex7lu`, tạo bởi Vercel, con của `production`): migration tới `20261104_018` (repo đã tới `20261113_027`), 14 user, 24 MB, compute max 0.5 CU, `pg_stat_statements` có sẵn nhưng chưa bật.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Con số **N** = số người dùng ảo (VU) đồng thời cao nhất mà vẫn đạt ngưỡng ở §5.5, đo ở 2 môi trường: local (1 instance app) rồi Vercel Preview.
- Báo cáo mỗi lần chạy: N, điểm gãy, nút thắt đầu tiên, latency theo endpoint, top query, tài nguyên DB/app, hàng đợi.
- Bộ script chạy lại được bằng vài lệnh, để đo lại sau mỗi lần tối ưu.

**Không làm (lần này)** — spec riêng nếu cần:

- Helper test concurrency (race) cho Vitest, CI pipeline, E2E Playwright, micro-benchmark từng hàm.
- Tối ưu code dựa trên kết quả: báo cáo chỉ ra, sửa là việc sau.
- Đo trình duyệt thật (Web Vitals dưới tải).

**Phản mục tiêu** (chạy được vẫn là hỏng):

- Tải chạm nhánh Neon `production`, hoặc dịch vụ production (Cloudinary, AgentMail, bucket production).
- Ghi dữ liệu tải vào nhánh `develop` (Vercel Preview đang dùng).
- Con số đo trên dữ liệu bé (14 user) — số đẹp giả.
- N bị giới hạn bởi máy chạy k6 chứ không phải app (CPU máy k6 > 80% ⇒ lần chạy không hợp lệ).
- Token session của user tải bị commit.

## 3. Ràng buộc

- **Ghi đi qua server action**: 9 file `actions/*.actions.js` (quiz, đăng ký khoá, chat, kết bạn...). Gọi được từ ngoài bằng `POST` tới đường dẫn trang với header `Next-Action: <id>`; id đổi mỗi lần build, lấy từ `.next/server/server-reference-manifest.json`. Đọc thì có 129 route `app/api/**`.
- **Auth**: session là JWE (`lib/authJwt.js`, key HKDF từ `NEXTAUTH_SECRET`) chứa `sid` trỏ tới row session trong DB; access hết hạn sau `AUTH_ACCESS_TOKEN_TTL_SECONDS` (mặc định 15 phút), sau đó client gọi `/api/auth/refresh` bằng refresh cookie.
- **Rate limit** (`lib/rateLimit.js`): theo user hoặc IP. Local không có header IP tin cậy nên đọc `x-forwarded-for` thường; trên Vercel chỉ tin `x-vercel-forwarded-for` (không giả được).
- **App container** (`compose.yml` profile `app`): env file qua `CODEDEV_ENV_FILE`, Redis local, code runner `sandbox-gateway`.
- `/tests` đã git-ignore; máy chạy là Windows + Docker Desktop.

## 4. Các cách đã cân nhắc

**Môi trường chạy app**

| Cách | Đánh đổi |
|---|---|
| Local (`next start`/Docker) → Neon `loadtest` | Rẻ, không đụng dịch vụ thật, chạy lại dễ. N là sức chịu **1 instance**; production tự scale nên giới hạn thật là DB/Upstash/Pusher. |
| Vercel Preview → Neon `loadtest` | N sát production. Tốn quota Vercel/Upstash/Pusher; rate limit theo IP chặn máy k6. |
| **Cả hai, local trước (đã chọn)** | Local tìm và sửa nút thắt rẻ; một lượt Vercel chốt N cuối. |

**DB của pha local** (máy chạy ở châu Á, Neon ở `us-east-1`: mỗi query tuần tự tốn ~200–250 ms mạng)

| Cách | Đánh đổi |
|---|---|
| **Postgres 16 local, 1 vCPU / 4 GB ≈ 1 CU, dữ liệu dump từ Neon `loadtest` (đã chọn)** | N local đo app + DB, không bị mạng méo. Không có cold start / autoscale của Neon, và app đi driver `pg` thay vì driver serverless của Neon; hai điểm này đo ở pha Vercel. |
| Neon `us-east-1` qua WAN, nới ngưỡng local | Giữ một DB duy nhất, nhưng N local chủ yếu đo mạng. |
| Project Neon mới ở Singapore | Thêm project để quản lý và trả tiền, vẫn phải copy dữ liệu. |

**Công cụ**

| Cách | Đánh đổi |
|---|---|
| **k6 qua Docker (đã chọn)** | Không thêm dependency npm; generator Go, vài nghìn VU/máy; có scenario ramp/soak/spike, threshold pass/fail, đẩy metric vào Prometheus sẵn có. JS trong k6 không phải Node ⇒ không import code app; phần tạo session làm bằng script Node riêng. |
| Artillery | Kịch bản YAML + JS, import được helper app, có Playwright. Generator Node nghẽn sớm, N dễ bị máy tải giới hạn. |
| Script Node + autocannon | Ít phụ thuộc nhất, nhưng phải tự viết ramp, percentile, threshold, báo cáo. |

## 5. Thiết kế

### 5.1 Môi trường dữ liệu (Neon)

1. Tạo nhánh `loadtest` con của `develop`. Chạy migration tới mới nhất **trên `loadtest`** (`db:migrate` với env file trỏ vào `loadtest`), không đụng `develop`.
2. Đặt compute `loadtest` max **1 CU** (bằng production). Bật `CREATE EXTENSION pg_stat_statements`.
3. Seed (§5.2) vào `loadtest`. Nhánh này là **base** đã seed.
4. **Pha Vercel**: mỗi lần chạy tải, tạo nhánh con `loadtest-run-<yyyymmdd-hhmm>` từ `loadtest`, chạy trên đó, ghi báo cáo, xoá nhánh. Dữ liệu mỗi lần chạy luôn sạch như nhau.
5. **Pha local**: `pg_dump -Fc` nhánh `loadtest` một lần ra `tests/loadtest/base.dump` (git-ignored). Restore vào DB `loadtest_base` trên container Postgres local (§5.3). Mỗi lần chạy: `DROP DATABASE IF EXISTS loadtest_run; CREATE DATABASE loadtest_run TEMPLATE loadtest_base;`, rồi app trỏ vào `loadtest_run`. Seed lại trên Neon thì dump lại.

Mọi thao tác tạo/xoá nhánh, đổi CU, chạy migration trên Neon đều do người làm chạy tay hoặc hỏi trước; script không tự gọi API Neon.

### 5.2 Seed và session

`scripts/loadtest/seed.mjs --env .env.loadtest` (theo kiểu `scripts/*.mjs` hiện có, đọc env file + `.env`):

- Khoá học: dùng `db/seeds/*.sql` có sẵn.
- User tổng hợp, username tiền tố `lt_`, số lượng mặc định 5 000 (tham số). Mỗi user: profile, vài khoá đã đăng ký, tiến độ học, lịch sử `exp_transaction`/`point_transaction` (để ranking có dữ liệu lớn), vài quan hệ bạn bè, vài hội thoại chat, vài `code_runs` cũ.
- Tỷ lệ dữ liệu (bao nhiêu khoá/user, bao nhiêu giao dịch) là giả định, ghi rõ trong output của script và trong báo cáo.
- Ghi dữ liệu bằng SQL/hàm DB có sẵn (`db/*.db.js`, SQL function) khi hợp lý, để trigger và counter đúng như thật.

`scripts/loadtest/sessions.mjs --env <env> --count <k>`: với k user `lt_`, tạo row session + refresh token bằng `sessionDb`, mã hoá session JWT bằng `encodeAuthJwt` đúng shape mà callback `jwt` của next-auth tạo ra, ghi `tests/loadtest/sessions.json` (git-ignored) gồm cookie session + refresh cookie. Chạy lại trước mỗi lần chạy tải, trên đúng DB của lần chạy đó (`loadtest_run` local hoặc nhánh run Neon), dùng cùng `NEXTAUTH_SECRET` với app. Refresh token dùng lại sẽ làm `db/session.db.js` thu hồi session, nên mỗi VU giữ một session riêng và giữ cookie giữa các vòng lặp.

Session hết access sau 15 phút: VU xử lý như trình duyệt — gặp 401/redirect thì gọi `/api/auth/refresh` với refresh cookie rồi thử lại. Tải refresh vì thế cũng được đo, như production.

`scripts/loadtest/actions.mjs`: sau `next build`, đọc `.next/server/server-reference-manifest.json`, ghi `tests/loadtest/actions.json` (tên action → id + trang). k6 đọc file này.

### 5.3 App local

- **DB**: service mới `postgres-load` trong `compose.yml`, profile `loadtest`, image `postgres:16` (cùng major với Neon), cổng host `5433` để không đụng DB dev `localhost:5432/codedev`. Giới hạn `cpus: 1`, `mem_limit: 4g`. Bật `shared_preload_libraries=pg_stat_statements` và `max_connections` bằng Neon (225). Volume riêng.
- Build và chạy bằng `compose.yml` profile `app` với `CODEDEV_ENV_FILE=.env.loadtest`, `APP_ENV=staging`. `.env.loadtest` (git-ignored) trỏ `DATABASE_URL` vào `postgres-load/loadtest_run` (driver `pg` tự chọn theo host), Redis local, MinIO local, Mailpit, Pusher/Beams rỗng, Cloudinary rỗng.
- Giới hạn container app **1 vCPU / 2 GB** (gần một function Vercel) để N là con số "mỗi instance" có nghĩa.
- Code runner: `sandbox-gateway` của compose như hiện tại.
- Realtime (Pusher) không đo ở local; đo ở pha Vercel.
- *(Quyết định của người viết spec)* **Inngest giống production**: trước pha local, đọc **tên** biến env của Vercel production (không đọc giá trị). Có `INNGEST_EVENT_KEY` thì local chạy thêm service `inngest` (compose profile `dev`) và đặt `INNGEST_DEV=1`. Không có thì để chạy inline như production. Báo cáo ghi rõ chạy kiểu nào.
- *(Quyết định của người viết spec)* **Nội dung lesson**: dùng Sanity như staging. `lib/lessonContent.js` cache body lesson trong Redis (`TTL.LESSON_CONTENT`), nên mỗi lesson chỉ gọi Sanity khoảng một lần mỗi TTL. Tải lên Sanity không đáng kể. Seed chỉ ghi danh vào khoá có trong `db/seeds`; người làm kiểm tra các lesson id đó có trên Sanity dataset của staging.
- *(Quyết định của người viết spec)* **Code runner**: production dùng Vercel Sandbox (`CODE_RUNNER_PROVIDER=vercel`), local dùng `sandbox-gateway` Docker. Ở local, `coderun.js` chỉ đo admission, hàng đợi và poll của app, không đo sức chịu của runner thật. Runner thật đo ở pha Vercel với số run có trần (`--max-runs`), vì mỗi run tốn tiền.

### 5.4 Kịch bản k6

Thư mục `loadtest/k6/`. Chạy: `docker run --rm -v ./loadtest:/scripts -v ./tests/loadtest:/data grafana/k6 run /scripts/k6/<file>.js` (gói lại thành `npm run load:<profile>`).

**Hành trình người dùng** (mỗi VU chọn theo tỷ lệ, nghỉ 3–10 s ngẫu nhiên giữa thao tác):

| Hành trình | Tỷ lệ | Thao tác chính |
|---|---|---|
| Khách (không đăng nhập) | 30% | trang chủ, danh sách khoá, chi tiết khoá, roadmap, ranking |
| Học viên | 50% | `me`, khoá của tôi, mở lesson, nộp quiz, đăng ký khoá, ranking của tôi |
| Xã hội | 15% | danh sách bạn, gửi/chấp nhận lời mời, danh sách chat, gửi tin |
| Lập trình | 5% | nộp code run, poll tới khi xong |

Tỷ lệ là giả định (chưa có số traffic thật), là tham số, ghi trong báo cáo. Mỗi request gắn tag `journey` và `endpoint` để tách metric.

IP: ở local, mỗi VU gửi `x-forwarded-for` riêng để rate limit theo IP hoạt động như nhiều người thật.

**Profile**

| Profile | Hình dạng | Dùng để |
|---|---|---|
| `smoke` | 5 VU, 1 phút | kiểm tra script, mọi check pass |
| `stress` | tăng 50 VU mỗi 2 phút tới khi vượt ngưỡng (dừng sớm qua `abortOnFail`) | tìm N |
| `soak` | giữ 70% N, 30 phút | rò rỉ bộ nhớ, pool cạn dần, hàng đợi dồn |
| `spike` | 0 → 2×N trong 30 s, giữ 2 phút | hành vi khi tăng đột ngột, phục hồi |

Code run có scenario riêng (`coderun.js`): đo số run đồng thời tối đa của runner, độ dài hàng đợi, thời gian chờ admission — vì giới hạn này do sandbox quyết định, không theo N chung.

### 5.5 Ngưỡng "chịu được"

- p95 < **800 ms** cho trang và API đọc; p95 < **1 500 ms** cho thao tác ghi (server action).
- Tỷ lệ lỗi (5xx, timeout, check fail) < **1%**. 429 tính riêng, không là lỗi, nhưng báo cáo số lượng.
- **N** = mức VU cao nhất trong `stress` mà cả hai ngưỡng còn đạt trong trọn bậc 2 phút đó.
- *(Quyết định của người viết spec)* p95 dùng để xác định N được tính **gộp theo lớp** (tất cả request đọc; tất cả request ghi), không tính riêng từng endpoint. p95 từng endpoint vẫn có trong báo cáo. Endpoint nào có p95 vượt 2× ngưỡng của lớp mình ở mức N thì được ghi là nút thắt. Lý do: nếu tính riêng, endpoint chậm nhất một mình quyết định N. Muốn chặt hơn thì đổi trong file ngưỡng.

Ngưỡng nằm trong một file cấu hình k6 dùng chung, đổi được.

### 5.6 Thu metric

| Lớp | Metric | Cách lấy |
|---|---|---|
| Client | RPS, p50/p95/p99 theo `endpoint`, lỗi, VU | k6 → Prometheus remote write (bật `--web.enable-remote-write-receiver` cho `prometheus` trong `compose.yml`) → dashboard k6 trong `monitoring/grafana/dashboards/`; `handleSummary` ghi JSON |
| DB | top 20 query theo tổng thời gian, mean, calls; số connection theo trạng thái; lock chờ | `pg_stat_statements_reset()` trước khi chạy, snapshot sau; sampler 15 s đọc `pg_stat_activity` |
| Neon | CU, connection | Neon console / API consumption, ghi tay vào báo cáo |
| App | CPU, RAM container | sampler `docker stats` 5 s → CSV |
| Hàng đợi | outbox chờ, `code_runs` đang chạy/chờ, dead letter | sampler 15 s, SQL đếm |
| Máy k6 | CPU | sampler, để loại lần chạy không hợp lệ |

Các sampler gom trong `scripts/loadtest/sample.mjs`, chạy song song với k6, ghi `tests/loadtest/<run>/`.

### 5.7 Báo cáo

`scripts/loadtest/report.mjs <run>` gộp summary k6 + output sampler thành `docs/loadtest/<yyyy-mm-dd>-<env>-<profile>.md` (commit): N, điểm gãy, nút thắt đầu tiên kèm bằng chứng, bảng p95 theo endpoint, top query, tài nguyên, hàng đợi, giả định (số dữ liệu seed, tỷ lệ hành trình, commit hash).

### 5.8 Pha Vercel Preview

Chỉ bắt đầu khi pha local đã có N và các nút thắt lớn đã được ghi lại.

Điều kiện trước khi chạy (kiểm tra và ghi trong báo cáo):

- Môi trường staging/preview dùng **riêng** production cho từng dịch vụ: Upstash, Pusher/Beams, AgentMail/Gmail, Cloudinary (staging tắt upload theo `docs/environments.md`), bucket S3, Inngest, Sanity dataset, Vercel Sandbox. Dịch vụ nào đang dùng chung: dừng, hỏi chủ dự án.
- `DATABASE_URL` của deployment trỏ đúng nhánh `loadtest-run-*`. Nhánh `develop` do tích hợp Neon–Vercel tạo, nên tích hợp có thể tự gắn `DATABASE_URL` cho mỗi preview. Người làm dùng một git branch riêng cho pha này, đặt `DATABASE_URL` theo branch trên Vercel, và xác nhận qua `/api/health` (hoặc log) rằng deployment nối đúng host trước khi chạy tải. Không xác nhận được: dừng.
- Vùng: Vercel production chạy `iad1`, Neon ở `us-east-1`. Deployment preview đặt cùng vùng để số đo sát production.
- Ước lượng chi phí (function invocation, băng thông, lệnh Upstash, tin Pusher) cho profile định chạy.
- Deployment Protection / firewall của Vercel cho phép máy k6.

Cách chạy: một deployment preview với env trỏ vào nhánh run Neon; `actions.json` lấy từ chính build đó. Hành trình khách bị rate limit theo IP thật của máy k6 ⇒ giảm tỷ lệ khách hoặc chấp nhận 429 và báo cáo riêng. **Không** thêm cơ chế bypass rate limit vào app.

## 6. Để lại cho người làm

- Danh sách endpoint và action cụ thể cho từng hành trình, payload của từng action.
- Shape chính xác của token session (đọc callback `jwt` trong cấu hình next-auth).
- Khối lượng seed cụ thể ngoài số user.
- Dashboard Grafana: dùng dashboard k6 chính thức hay tự dựng tối giản.
- Tên script npm.
