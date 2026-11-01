# CodeDev — Kế hoạch Admin Panel

Cập nhật: 2026-11-01. CodeDev dùng cho **học tập và thử nghiệm**, không thu tiền. Tham chiếu `file:dòng` đúng tại thời điểm viết. Bản này chỉnh 6 module đề xuất ban đầu cho khớp với dữ liệu và kiến trúc đang có; phần **Khác với đề xuất gốc** ở cuối mỗi module nói rõ cái gì bị bỏ, đổi hoặc hoãn và vì sao.

**Đã chốt:**

- Mở rộng `/admin` đang có, **không** dựng app admin riêng. Role cao nhất là `super_admin` (mọi permission, cấp qua migration và trigger, không có đường tắt trong code). Giữ RBAC đọc từ DB (`lib/authz.js`), audit trong cùng transaction (`services/admin.service.js:55`), `apiRoute` + `requirePermission` cho mọi API.
- Nội dung bài học vẫn soạn ở **Sanity Studio** (`/studio`, type `lesson`) và seed SQL (`db/seeds/*.sql`). Admin quản **metadata, hiển thị, thứ tự, publish, giá, quyền truy cập**; không làm trình soạn lesson thứ hai.
- Giao diện theo kiểu dashboard Vercel (sidebar thu gọn được, danh sách kiểu Deployments, trang chi tiết kiểu deployment, Audit kiểu Logs, Settings dạng thẻ), giữ màu và font của CodeDev (mục 5).
- **Admin chạy ở local, staging và production**, cùng codebase, chung deployment Vercel với trang học; production có thêm lớp gia cố và cờ tắt khẩn cấp `ADMIN_ENABLED=0` (mục 2).
- Admin làm **hành động** và tóm tắt trạng thái hiện tại; **Grafana** (Docker ở local, Grafana Cloud Free ở production, chung một bộ dashboard) làm chuỗi thời gian và cảnh báo (mục 6). Admin chỉ link sang Grafana.
- Không thêm hạ tầng log mới (Sentry, Axiom…) trong kế hoạch này.

## 1. Hiện trạng

| Phần | Đã có | File |
|---|---|---|
| Trang | `/admin` một trang, 5 tab: Courses, Points & access, Orders, Content KPIs, Audit log | `app/admin/page.jsx`, `components/admin/adminPage.jsx` |
| API | `audit`, `content-kpis`, `courses` (+ `PATCH`, `publish`, `offers`), `entitlements`, `exp-audit`, `experience/adjust`, `points/adjust`, `orders` (+ `refund`), `users` (tìm user cho tab access) | `app/api/admin/**/route.js` |
| Quyền | Bảng `identity.roles / permissions / role_permissions / user_roles`. Role: `user`, `student`, `instructor`, `admin`, `course_manager`. Permission admin: `admin.read`, `course.update/publish/price`, `points.adjust`, `order.list/refund`, `entitlement.grant` | `lib/authz.js`, `db/schema.sql:7288-7380` |
| Audit | `identity.audit_log` append-only (trigger `identity.audit_log_append_only`) | `db/admin.db.js` |
| Route guard | Chỉ có entry `"/admin"` (khớp đúng path) | `auth/route/premium.route.js:33` |
| Trạng thái user | `user_status_enum`: `active / inactive / blocked`. Login trả `blocked`; session và refresh JOIN `u.status = 'active'` | `db/user.db.js:32`, `db/session.db.js:118,248`, `services/auth.service.js:305` (`revokeAllSessions`) |
| Job | Inngest: `code-run`, `outbox-deliver`, `sweeper` (10 phút), `account-maintenance`, `exp-audit`, `dead-letter-sink` | `jobs/*.js` |
| Health | DB, Redis, storage, jobs (dead letter 1 giờ, run đang chạy, chờ lâu nhất) | `app/api/health/route.js` |
| DLQ | CLI `npm run dlq` (list / resolve / retry) | `scripts/dlq.mjs`, `db/deadLetter.db.js` |

Điểm lệch so với đề xuất gốc, quyết định thiết kế bên dưới dựa trên chúng:

1. **Instructor chưa là tài khoản.** `catalog.course.instructor` là `text` ("CodeDev Engineering Team"), không có FK tới user. Role `instructor` có trong bảng nhưng không gắn quyền nào và không sở hữu course nào.
2. **Không có luồng duyệt.** `publish_status` là `draft | published | unpublished | archived`; người publish chính là admin / course manager.
3. **Không có "suspend có thời hạn".** Chỉ có `blocked` vô thời hạn.
4. **Không có worker riêng.** Function Inngest chạy trong app Next.js; "worker" thực chất là Inngest + pool Vercel Sandbox (hoặc container `sandbox` khi `CODE_RUNNER_PROVIDER=docker`).
5. **Không có kho log lỗi / incident.** Lỗi job nằm ở `ops.dead_letters`, `code_runs.error`, `auth_outbox.last_error`; còn lại là `console.error`.
6. **Không có bảng feature flag / config.** Giới hạn nằm trong code (`lib/challenges/limits.js`, `lib/rateLimit.js`), cấu hình môi trường đọc từ env (`lib/envCheck.mjs`, `lib/storageConfig.mjs`).

## 2. Kiến trúc và cách chạy

### 2.1 Ba môi trường: local, staging, production

Admin là một phần của app, chạy ở cả ba môi trường với cùng một codebase; chỉ dữ liệu và cấu hình khác nhau.

| | Local (development) | Staging (Vercel Preview) | Production |
|---|---|---|---|
| Lệnh | `npm run dev` (dịch vụ từ `npm run services:up`) | Mọi deployment Preview trên Vercel (nhánh `develop`, PR) | Vercel Hobby, chung project và deployment với trang học (2.2) |
| URL | `http://localhost:3000/admin` | URL preview của Vercel, có Vercel Authentication | `https://<domain>/admin` |
| Dữ liệu | PostgreSQL, Redis, MinIO, Mailpit, Inngest dev server trên máy | Neon branch `staging` (dữ liệu production đã ẩn danh, 2.3), Redis và storage tách riêng | Neon `production`, Upstash, Neon S3, Gmail, Inngest Cloud |
| Đăng nhập | Email + mật khẩu, OAuth nếu `.env.local` có app OAuth riêng cho localhost | Email + mật khẩu (mật khẩu chung của staging sau khi ẩn danh) | Email + mật khẩu, Google, GitHub |
| Thanh toán | Provider `mock` (tuỳ chọn SePay chế độ thử, mục 07) | Provider `mock` (tuỳ chọn SePay chế độ thử) | Provider `mock` |
| Super admin đầu tiên | `npm run admin:role -- grant <email> super_admin` với `.env.local` | Cùng lệnh với env của staging | Cùng lệnh với `--env .env.production` (như `db:migrate:prod`) |
| Nhận biết môi trường | Chip "Development" trung tính | Chip "Staging" màu `info`, dải 4px `info` ở mép trên, tiêu đề tab "STAGING ·" | Chip "Production" màu cảnh báo, dải 4px `warning`, tiêu đề tab "PROD ·" |
| Grafana | Docker profile `monitoring` (mục 6) | Không cần dashboard riêng; dùng chung Grafana Cloud với biến `env` nếu muốn | Grafana Cloud Free (mục 6) |
| Seed để thử | Dữ liệu từ `db/seeds/*.sql` và vài user / run mẫu | Bản sao production đã ẩn danh | Dữ liệu thật |

`APP_ENV` thêm giá trị `staging` (`lib/appEnv.mjs`): mọi kiểm tra an toàn như production (`isProductionEnv()` vẫn đúng cho các luật bảo mật), nhưng cho phép provider thanh toán thử, thư mục Cloudinary `codedev/staging/...`, và không gửi mail thật (chỉ log hoặc gửi vào hộp thư thử).

**Cờ tắt khẩn cấp:** `ADMIN_ENABLED=0` làm `/admin*`, `/api/admin/*`, `/studio*` trả 404 trong môi trường đó mà không cần deploy code (Vercel: đổi biến rồi redeploy; Docker: đổi env rồi khởi động lại). Mặc định là bật. Kiểm ở ba chỗ trong `lib/adminMode.js`: `proxy.js`, `app/admin/layout.jsx` + `app/studio`, và `apiRoute` của `/api/admin/*`.

**Gia cố cho production**, vì admin mở trên internet:

- Vá A1 và chạy test tĩnh + ma trận quyền (3.6) **trước** khi deploy bất kỳ màn admin mới nào.
- Mọi API admin đòi `admin.read` cộng quyền của việc, `csrf: true`, `rateLimiters.admin` (đã có cho các route hiện tại).
- Header riêng cho `/admin*` và `/studio*`: `X-Robots-Tag: noindex`, `Cache-Control: no-store`, `frame-ancestors 'none'` trong CSP, `Referrer-Policy: no-referrer`.
- **Xác nhận lại danh tính cho việc nhạy cảm** (gán role, khoá user, hoàn đơn, retry hàng loạt): nếu lần đăng nhập gần nhất của phiên cũ hơn 15 phút thì yêu cầu nhập lại mật khẩu (hoặc đăng nhập lại qua OAuth) trước khi gửi. Lưu thời điểm xác nhận trên session ở server, không trong cookie.
- Tuỳ chọn `ADMIN_IP_ALLOWLIST` (danh sách CIDR): khi đặt, admin chỉ phục vụ IP trong danh sách. Mặc định không đặt.
- Đăng nhập admin thất bại hoặc bị 403 được ghi `identity.audit_log` (`action = 'admin.denied'`), để thấy dò quyền.


### 2.2 Hosting: chung project Vercel với trang học

Admin chạy trong **cùng project và cùng deployment Vercel** với trang học viên, ở `https://<domain>/admin`. CodeDev dùng cho học tập và thử nghiệm, không thu tiền, nên phù hợp với các gói miễn phí đang dùng: Vercel Hobby, Neon Free, Upstash Free, Inngest miễn phí, Grafana Cloud Free.

Lý do không tách: chung deployment không tốn thêm gì, chỉ build một lần, dùng chung đăng nhập, phiên và RBAC, không nhân đôi bí mật. Một project Vercel thứ hai hay một nhà cung cấp khác vẫn dùng cùng bí mật DB nên không cô lập thêm được gì, lại tốn build và thêm chỗ phải deploy.

Giới hạn của gói miễn phí ảnh hưởng tới admin và monitoring (theo trang giá ngày 2026-10-31):

| Dịch vụ | Giới hạn |
|---|---|
| Vercel Hobby | Chỉ dùng phi thương mại; Active CPU 4 giờ / tháng cho cả tài khoản; Password Protection và Drains cần Pro |
| Neon Free | **100 CU-hours / tháng, tính chung mọi branch**, 0.5 GB; compute ngủ sau 5 phút rảnh; hết hạn mức thì compute tạm dừng tới tháng sau, tức là **cả trang học ngừng chạy** |
| Inngest miễn phí | Không có Prometheus metrics export |
| Grafana Cloud Free | 10.000 series metric, 50 GB log, 50 GB trace mỗi tháng, giữ 14 ngày, 3 người dùng |

**Việc phải làm vì chạy chung:**

- **Preview chạy trên branch `staging` đã ẩn danh** (2.3), không bao giờ dùng DB production hay bản sao chưa ẩn danh, vì mỗi preview đều có admin.
- **Không để admin đánh thức Neon:** màn System và Overview không tự làm mới khi tab ẩn, làm mới 60 s khi tab hiện, có nút làm mới tay; dashboard dùng cache Redis 60 s.
- **Active CPU:** G3 (OpenTelemetry) lấy mẫu 10%, theo dõi mục Usage của Vercel sau khi bật.

**Hiện trạng Neon (đọc qua Neon API ngày 2026-11-01), chưa xử lý:**

- Compute mặc định đang **cố định 1 CU** (min = max = 1), nên 100 CU-hours chỉ còn khoảng **100 giờ thức mỗi tháng** cho cả project. Nên hạ về 0.25 CU tối thiểu, 1 CU tối đa.
- **Đã sửa (2026-11-01, chưa deploy):** `sweeper` và `ranking-refresh` trước chạy 10 và 5 phút một lần, giữ compute thức gần như liên tục. Giờ cả hai chạy `0 * * * *` (mỗi giờ, cùng phút, nên DB chỉ thức một lần mỗi giờ); giữa hai lần chạy, bảng xếp hạng do người đọc đầu tiên làm mới, và run quá hạn được đóng khi người học poll. Ước tính khoảng 60 CU-hours / tháng cho cron ở 1 CU, khoảng 15 ở 0.25 CU, chưa tính người học.

**Hiện trạng Inngest (2026-11-01):** tích hợp Inngest ↔ Vercel đã bật cho project `codedev`, path `/api/inngest`, domain production `https://code-dev-navy.vercel.app`, chưa đặt Deployment protection key. `GET /api/inngest` trên production trả 401 kèm header `X-Inngest-Sdk-Handled: true`: route và SDK hoạt động, 401 là phản hồi bình thường cho request không có chữ ký của Inngest. Overview của Inngest có hoạt động (event app gửi bằng `INNGEST_EVENT_KEY`) nhưng app **chưa sync**, nên chưa có function nào được đăng ký: event chưa kích hoạt function và cron chưa chạy.

**Thứ tự bắt buộc trước khi sync:** ngay khi app sync xong, `sweeper` và `ranking-refresh` bắt đầu chạy. Với nhịp cũ ở 1 CU, compute thức liên tục sẽ hết 100 CU-hours trong khoảng 4 ngày, rồi DB production tạm dừng tới 01/12. Vì vậy:

1. ~~Đổi nhịp hai cron~~ (đã làm trong code, xem trên). Còn lại: hạ compute Neon về 0.25–1 CU (Neon console → branch `production` → compute → autoscaling).
2. Deploy production với thay đổi đó.
3. Sync app: trong Inngest, Apps → Sync new app với URL `https://code-dev-navy.vercel.app/api/inngest`, hoặc redeploy trên Vercel để tích hợp tự sync. Kiểm Vercel có `INNGEST_SIGNING_KEY` và `INNGEST_EVENT_KEY` cho môi trường Production (tích hợp tự thêm; deployment tạo trước khi thêm biến thì không có, cần redeploy).
4. Sau sync: thấy đủ 7 function (cộng các handler `onFailure`) (`code-run`, `outbox-deliver`, `sweeper`, `account-maintenance`, `exp-audit`, `ranking-refresh`, `dead-letter-sink`) trong Apps; theo dõi Usage của Neon và số execution của Inngest trong tuần đầu.

Deployment protection key để trống là đúng với thiết kế staging (2.3): preview không chạy job nền, nên Inngest không cần vượt Vercel Authentication để gọi preview.

### 2.3 Staging

**Hiện trạng (2026-11-01):**

| Branch | Tạo bởi | Nội dung |
|---|---|---|
| `production` | console | Dữ liệu thật: 14 user, 63 course, migration mới nhất `20261101_002` |
| `staging` | Vercel integration, 2026-10-08 | Bản sao production **ngày 8/10, schema cũ** (chưa có schema `identity`, `catalog`, `commerce`…); không chạy được code hiện tại |
| `preview/develop` | Vercel integration, 2026-11-01 | Bản sao **đầy đủ** production hôm nay, tức là có email và hash mật khẩu thật |
| `perf-rehearsal-20261101`, `claim-purge-test-20261024`, `seed-test-a1-a2-20261024` | console | Branch thử nghiệm cũ, đều là bản sao production |

Tích hợp Neon của Vercel đang tạo một branch mới từ `production` cho mỗi deployment Preview. Hệ quả: dữ liệu cá nhân thật nằm trong mọi bản preview, mỗi branch ăn vào hạn mức compute và số branch chung của project, và admin trên preview chạy trên dữ liệu thật đã sao chép.

**Thiết kế:**

1. **Một DB staging cho mọi Preview.** Trong Vercel, biến `DATABASE_URL` của môi trường Preview trỏ cố định vào branch `staging`; tắt tạo branch tự động cho mỗi preview trong tích hợp Neon. Nhiều preview dùng chung một staging là chấp nhận được với nhóm nhỏ.
2. **Làm mới staging = sao chép rồi ẩn danh ngay.**
   - "Reset from parent" branch `staging` từ `production` (tức thì, copy-on-write, mang theo schema và migration mới nhất).
   - Chạy ngay `npm run db:anonymize -- --env .env.staging` (script mới), trong một transaction:
     - email thành `user<id>@staging.codedev.test`, username thành `user<id>`;
     - mật khẩu mọi tài khoản đặt về một mật khẩu chung của staging;
     - xoá `identity.sessions`, `refresh_tokens`, `email_tokens`, `accounts` (liên kết OAuth), `auth_outbox`;
     - xoá IP và user agent trong `audit_log`, đơn hàng giữ số tiền nhưng bỏ thông tin người trả.
   - Script từ chối chạy nếu host trong connection là branch `production`, và in số dòng đã đổi.
   - Làm mới khi cần dữ liệu mới, không theo lịch.
3. **Dọn branch cũ:** xoá `preview/develop` và ba branch thử nghiệm sau khi xác nhận không còn dùng, vì chúng giữ bản sao dữ liệu cá nhân và chiếm hạn mức. Việc xoá không hoàn tác được, người có quyền trên Neon làm bằng tay.
4. **Tách các dịch vụ khác:** Redis (một database Upstash khác, hoặc tiền tố khoá `staging:`), storage (bucket hoặc tiền tố `staging/` trên Neon S3), Inngest (môi trường branch của Inngest hoặc tắt job nền ở staging), Pusher (app riêng hoặc tắt).
5. **Bảo vệ:** giữ Vercel Authentication (Standard Protection) cho Preview, để URL preview chỉ người trong team Vercel mở được.
6. **Migration:** `npm run db:migrate` với env staging chạy trước khi merge vào `main`; `db:compare` giữa staging và production phải "in sync" sau khi release.

### 2.4 Route

Đổi từ một trang nhiều tab sang shell sidebar kiểu Vercel (mục 5.2), mỗi module một route. Tab hiện có chuyển nguyên component sang route mới, không viết lại.

```
app/admin/
  layout.jsx            guard admin.read (loadActor) + sidebar lọc theo permission
  page.jsx              01 Dashboard
  users/page.jsx        02 danh sách user
  users/[id]/page.jsx   02 chi tiết: hồ sơ, role, trạng thái, phiên, hoạt động, entitlement, điểm
  courses/page.jsx      03 (CourseAdmin hiện có)
  courses/[id]/page.jsx 03 module, lesson, challenge, offer, enrollment
  catalog/page.jsx      03 category, language, skill, career role
  enrollments/page.jsx  03 (AccessAdmin hiện có, phần entitlement)
  orders/page.jsx       03 (OrdersAdmin hiện có)
  challenges/page.jsx   04 challenge + KPI (ContentKpiAdmin hiện có)
  runs/page.jsx         04 code run / submission
  runs/[id]/page.jsx    04 chi tiết run
  audit/page.jsx        06 kiểu trang Logs (AuditLog hiện có)
  system/page.jsx       05 health, job, sandbox, dead letter, DB, link Grafana
  settings/[section]/page.jsx  06 general, roles, storage, mail, limits, observability (chỉ đọc)
```

- `layout.jsx` làm đúng việc `app/admin/page.jsx` đang làm (redirect `/auth`, `Forbidden` trong `HomeLayout`), mỗi `page.jsx` con kiểm tra thêm permission riêng của nó.
- Thêm entry `"/admin/:path*"` vào `auth/route/premium.route.js` (route config khớp đúng path).
- Bảng dữ liệu dùng component shadcn đã có trong `components/shadcn`; phân trang keyset theo `id` cho `code_runs`, `audit_log`, `users` (bảng tăng nhanh).
- Hành động phá huỷ hoặc ảnh hưởng người dùng đi qua `components/admin/confirmDialog.jsx` và bắt buộc nhập **lý do** (ghi vào `audit_log.reason`), như `points/adjust` đang làm.

## 3. Phân quyền

### 3.1 Audit hiện trạng (2026-10-31)

Đã đọc mọi `app/api/admin/**/route.js`, `app/admin/page.jsx`, `lib/authz.js`, `auth/can.js`, `auth/route/*`, `actions/*.js`, `app/api/internal/*`, `app/api/inngest`, `app/api/payments/mock`, `app/studio`, và truy vấn (chỉ đọc) bảng role / permission trên DB local.

| # | Mức | Phát hiện | Bằng chứng | Xử lý |
|---|---|---|---|---|
| A1 | **Nghiêm trọng** | Role mặc định `user` có `course.update` và `course.create`. `PATCH /api/admin/courses/[id]` chỉ đòi `course.update`, nên **mọi học viên đã đăng nhập sửa được metadata course** (access model, level, skill…) qua API. Trang `/admin` chặn họ vì thiếu `admin.read`, API thì không. | `public.default_role_id()` trả role `user`; DB local: `user` có `course.create, course.update, blog.create, blog.update`; 18/18 user mang role `user`; **đã xác nhận trên production ngày 2026-11-01**: role `user` có `course.create, course.update, blog.create, blog.update`, 13 user mang role `user`, chưa có tài khoản admin nào; `app/api/admin/courses/[id]/route.js:10` | Migration P0 gỡ `course.create`, `course.update`, `course.delete`, `blog.create`, `blog.update`, `blog.delete` khỏi `user` (không code nào khác dùng các quyền này, đã grep). Mọi API admin đòi thêm `admin.read` (3.4). Kiểm tra production bằng câu truy vấn ở 3.6 trước khi deploy. Nếu cần chặn ngay trước khi migration lên production, đặt `ADMIN_ENABLED=0` (2.1) rồi redeploy. |
| A2 | Cao | `auth/can.js:10` cho qua mọi route khi JWT có `role === 'admin'`, và cho qua khi token **không có** danh sách permission. | `auth/can.js:10-25` | Chấp nhận vì đây chỉ là lớp điều hướng; ghi rõ trong code là không phải ranh giới bảo mật. Layout admin luôn kiểm bằng `loadActor` (DB). Không thêm logic quyền nào vào `can.js`. |
| A3 | Cao | `/studio` (Sanity Studio) không có kiểm tra phía CodeDev; chỉ dựa vào đăng nhập tài khoản Sanity. Trang `force-static`. | `app/studio/[[...tool]]/page.jsx` | Đổi sang render động, kiểm `content.studio` bằng `loadActor` như layout admin. Thành viên dự án Sanity vẫn là lớp thứ hai. |
| A4 | Trung bình | `admin.read` một mình mở được Content KPIs và Audit log (audit chứa lý do, before/after, IP). | `app/api/admin/audit/route.js:8`, `content-kpis/route.js:9` | Audit đòi `audit.read`; KPI giữ `admin.read`. |
| A5 | Trung bình | Danh sách quyền UI chép tay ở hai nơi (`ADMIN_PERMISSIONS` trong `app/admin/page.jsx:23` và từng component). | | Một hằng `lib/adminPermissions.js` (mảng mã + mục sidebar nào cần mã nào), dùng chung cho layout, sidebar và test. |
| A6 | Thấp | Role `student` và `instructor` không có quyền nào; `auth/policies/course.policy.js` kiểm `moderator`, role không tồn tại. | DB local; `course.policy.js:13,31` | Giữ `instructor` (để dành), xoá `student` nếu không có user nào mang, ghi chú `moderator` là mã chết. |
| A7 | Thấp | Không có admin nào trên DB local, không có đường cấp quyền admin đầu tiên ngoài sửa SQL tay. | DB local | CLI bootstrap (3.3). |

Đã kiểm và **ổn**: route `internal/*` so khớp `CRON_SECRET` và trả 404 khi chưa cấu hình; `/api/inngest` do `serve()` kiểm chữ ký; mock payment 404 ở production và chỉ thấy đơn của chính mình; chấm bài bằng kết quả trình duyệt chỉ chạy ở dev với JavaScript (`services/challenge.service.js:789`); các server action học viên đều lấy `userId` từ session qua `runAction`.

### 3.2 Role và cấp bậc

Thêm role `super_admin` là mức bao quát nhất. Cấp bậc dùng để quyết định ai được gán / gỡ role cho ai và ai được khoá ai.

| Role | Bậc | Phạm vi |
|---|---|---|
| `super_admin` | 100 | **Mọi permission**, kể cả permission thêm về sau. Duy nhất được gán / gỡ `admin` và `super_admin`, sửa ma trận quyền. Ít người (1–2). |
| `admin` | 80 | Mọi permission trừ `role.manage`. Gán / gỡ được role có bậc thấp hơn 80. |
| `course_manager` | 50 | Nội dung: course, catalog, challenge, xem submission, Studio. Không thấy user, đơn, hệ thống. |
| `instructor` | 30 | Để dành cho luồng instructor (hoãn). Không quyền admin nào. |
| `user` | 10 | Học viên. Chỉ quyền học tập (sau khi gỡ theo A1). |

Cách cấp "mọi permission" cho `super_admin` mà không thêm đường tắt trong code:

- Migration gán toàn bộ `identity.permissions` hiện có cho `super_admin`.
- Trigger `AFTER INSERT ON identity.permissions` tự thêm `role_permissions` cho `super_admin`, nên một permission mới không bao giờ thiếu ở mức cao nhất.
- `requirePermission` giữ nguyên: vẫn kiểm từng mã. Không có wildcard `*`, không có `if (role === 'super_admin') return true`. Quyền vẫn đọc được, review được và hiện đúng trong ma trận.
- Cột `identity.roles.rank smallint` lưu bậc; `loadActor` trả thêm `rank` = bậc cao nhất của user.

### 3.3 Danh mục permission đầy đủ

| Permission | Việc | super_admin | admin | course_manager |
|---|---|---|---|---|
| `admin.read` (có) | Vào admin, dashboard, danh sách course | ✓ | ✓ | ✓ |
| `user.read` | Danh sách và chi tiết user, timeline | ✓ | ✓ | |
| `user.pii` | Thấy email đầy đủ, IP, user agent (không có thì che: `c***@sv.sgu.edu.vn`) | ✓ | ✓ | |
| `user.status` | Activate / suspend / block | ✓ | ✓ | |
| `session.revoke` | Thu hồi phiên của người khác | ✓ | ✓ | |
| `role.assign` | Gán / gỡ role thấp hơn bậc của mình | ✓ | ✓ | |
| `role.manage` | Sửa ma trận role × permission | ✓ | | |
| `course.update` (có) | Metadata course, cấu trúc module / lesson | ✓ | ✓ | ✓ |
| `course.publish` (có) | Đổi `publish_status` | ✓ | ✓ | ✓ |
| `course.price` (có) | Offer | ✓ | ✓ | ✓ |
| `course.delete` (có) | Xoá mềm course | ✓ | ✓ | |
| `catalog.update` | Category, language, skill, career role, industry, goal | ✓ | ✓ | ✓ |
| `content.studio` | Mở `/studio` | ✓ | ✓ | ✓ |
| `entitlement.grant` (có) | Cấp / thu quyền vào course | ✓ | ✓ | |
| `order.list` (có), `order.refund` (có) | Đơn hàng, hoàn điểm | ✓ | ✓ | |
| `payment.read` | Danh sách thanh toán, webhook lỗi (mục 07) | ✓ | ✓ | |
| `payment.reconcile` | Xem payload webhook; ghép tiền chuyển sai khi thử SePay | ✓ | ✓ | |
| `points.adjust` (có) | Điều chỉnh điểm và EXP | ✓ | ✓ | |
| `challenge.update` | Trạng thái, publish, điểm của challenge | ✓ | ✓ | ✓ |
| `submission.read` | Xem source và kết quả chạy của user | ✓ | ✓ | ✓ (câu hỏi mở 2) |
| `coderun.cancel` | Huỷ run | ✓ | ✓ | |
| `ops.read` | Trang System | ✓ | ✓ | |
| `ops.resolve` | Resolve / retry dead letter, đóng run quá hạn hàng loạt | ✓ | ✓ | |
| `audit.read` | Audit log | ✓ | ✓ | |
| `settings.read` | Trang cấu hình chỉ đọc | ✓ | ✓ | |

Quy ước: đọc là `*.read`, hành động có tác động là động từ riêng; không gộp đọc và ghi vào một mã. Hành động nhạy cảm (`user.status`, `role.assign`, `order.refund`, `points.adjust`, `coderun.cancel`, `ops.resolve`) bắt buộc lý do.

### 3.4 Kiểm tra theo lớp

Mỗi lớp tự đứng được; lớp dưới không tin lớp trên.

| Lớp | Kiểm gì | Ở đâu |
|---|---|---|
| 0. Môi trường | `ADMIN_ENABLED=0` thì `/admin*`, `/api/admin/*`, `/studio*` trả 404; production thêm header riêng, xác nhận lại danh tính cho việc nhạy cảm, tuỳ chọn `ADMIN_IP_ALLOWLIST` | `lib/adminMode.js`, `proxy.js`, layout, `apiRoute` (2.1) |
| 1. Proxy | Có session (route `"/admin/:path*"`, `"/studio/:path*"` là `PRIVATE`) | `auth/route/premium.route.js`, `proxy.js` |
| 2. Layout / page | `loadActor` từ DB: `admin.read` cho layout, permission riêng cho từng page; thiếu thì `Forbidden` trong `HomeLayout` | `app/admin/layout.jsx`, mỗi `page.jsx` |
| 3. API | `requirePermission(userId, ["admin.read", <quyền của việc>])` ở dòng đầu mỗi handler; `csrf: true` và `rateLimiters.admin` cho mọi request ghi | `app/api/admin/**/route.js` |
| 4. Service | Quy tắc nghiệp vụ trong transaction: bậc (3.5), tự thao tác, super admin cuối cùng; che PII khi thiếu `user.pii` | `services/admin.service.js` và service mới |
| 5. Database | Audit append-only (trigger có sẵn), audit ghi cùng transaction với thay đổi | `identity.audit_log` |
| 6. UI | Ẩn mục sidebar và nút khi thiếu quyền. **Không bao giờ là ranh giới bảo mật.** | `lib/adminPermissions.js` |

### 3.5 Quy tắc role và khoá tài khoản

Kiểm ở service, trong transaction có `SELECT … FOR UPDATE` trên các user liên quan:

- Chỉ gán / gỡ role có bậc **thấp hơn** bậc của mình; riêng `super_admin` gán được `admin` và `super_admin`.
- Chỉ khoá / suspend / thu hồi phiên của user có bậc thấp hơn mình. Admin không khoá được admin khác; super admin khoá được admin.
- Không tự gỡ role của chính mình, không tự khoá mình.
- Luôn còn ít nhất một `super_admin` đang `active`: chặn gỡ / khoá người cuối cùng.
- Đổi role hoặc khoá xong thì thu hồi mọi phiên của người bị đổi (quyền đọc từ DB nên có hiệu lực ngay, thu hồi phiên để JWT cũ không còn được refresh).
- Super admin đầu tiên chỉ cấp được bằng CLI có quyền vào DB: `npm run admin:role -- grant <email> super_admin --reason "<lý do>"` (script mới trong `scripts/`, ghi audit với `actor_id NULL`, `reason` bắt đầu bằng `cli:`). UI không có đường nâng lên super admin từ con số không.

### 3.6 Test phân quyền

- **Test tĩnh:** quét mọi `app/api/admin/**/route.js`, fail nếu một handler được export không gọi `requirePermission` trước khi đọc body hoặc gọi service. Chặn việc quên kiểm khi thêm route mới.
- **Ma trận route × role:** với mỗi route admin và mỗi role (`super_admin`, `admin`, `course_manager`, `instructor`, `user`, chưa đăng nhập), khẳng định mã trả về (200 / 403 / 401). Bảng kỳ vọng sinh từ `lib/adminPermissions.js`, không viết tay hai lần.
- **Quy tắc service:** gán role cao hơn mình, tự gỡ, gỡ super admin cuối cùng, admin khoá admin, PII bị che khi thiếu `user.pii`.
- **Hồi quy A1:** user role `user` gọi `PATCH /api/admin/courses/[id]` nhận 403.
- **Kiểm production trước khi deploy P0** (chỉ đọc):

```sql
SELECT r.code, p.resource || '.' || p.action AS permission
FROM identity.roles r
JOIN identity.role_permissions rp ON rp.role_id = r.id
JOIN identity.permissions p ON p.id = rp.permission_id
WHERE r.code = 'user' AND p.resource IN ('course', 'blog') AND p.action IN ('create', 'update', 'delete');
```

## 4. Module

### 01. Dashboard (`/admin`)

| Ô | Nguồn |
|---|---|
| Tổng user, user mới 7 ngày, chưa verify email | `identity.users` (`status`, `email_verified`, `created_at`) |
| Course manager / instructor / admin | `identity.user_roles` × `roles.code` |
| Course theo `publish_status`, free / premium | `catalog.course` (`is_deleted = false`) |
| Challenge đang mở, quiz, coding | `challenge.challenges` (`status`, `type`, `is_published`) |
| Submission hôm nay | `challenge.code_submissions.submitted_at` + `challenge.question_submissions` |
| Run hôm nay theo trạng thái, tỷ lệ timeout / failed | `challenge.code_runs` (`queued_at`, `status`) |
| User hoạt động 24h / 7 ngày | `identity.sessions.last_seen_at` (đếm `DISTINCT user_id`) |
| Enrollment và đơn mới 7 ngày | `learning.register.created_at`, `commerce.orders` |
| Sức khoẻ nền tảng | Gọi lại phần tính của `/api/health` (DB, Redis, storage, jobs) |

- Một API `GET /api/admin/dashboard`, một query gộp nhiều `COUNT(*) FILTER (...)`; cache Redis 60 giây qua `lib/cache.js` (key thêm vào `lib/cacheKeys.js`), như `courseService.getCatalogStats`.
- Biểu đồ: một biểu đồ 14 ngày cho submissions (5.5). Không sparkline trên KPI, không làm dashboard tuỳ biến; xem lâu hơn hay chi tiết hơn thì sang Grafana.

**Khác với đề xuất gốc:** "Instructors" đổi thành số tài khoản theo role (admin / course manager / instructor), vì instructor không phải thực thể riêng.

### 02. User Management (`/admin/users`)

**Danh sách:** tìm theo username / email / public_id, lọc theo role, `status`, `email_verified`, khoảng ngày tạo. Cột: username, email, role, status, verified, tạo lúc, hoạt động gần nhất.

**Chi tiết user** (`/admin/users/[id]`), mỗi phần là một khối:

- Hồ sơ: `identity.users`, `profile.info`, tài khoản OAuth liên kết (`identity.accounts`, chỉ provider và ngày).
- Trạng thái: Activate / Suspend đến ngày / Block, kèm lý do.
- Role: gán / gỡ theo bậc (quy tắc ở 3.5).
- Phiên: `identity.sessions` còn hiệu lực (user agent, IP, last_seen); nút thu hồi tất cả (`authService.revokeAllSessions`).
- Học tập: `learning.register`, `commerce.entitlement`, điểm và EXP (dùng lại `points/adjust`, `experience/adjust`).
- Lịch sử hoạt động: timeline gộp, phân trang theo thời gian, từ:
  - `identity.audit_log` có `target_id` là user này (việc admin làm với họ) và có `actor_id` là họ (việc họ làm với quyền admin);
  - `identity.sessions` (đăng nhập);
  - `challenge.code_runs` / `code_submissions` / `question_submissions`;
  - `profile.point_transaction`, `profile.exp_transaction`;
  - `commerce.orders`.

**Suspend có thời hạn** cần migration:

```sql
ALTER TABLE identity.users
  ADD COLUMN status_reason text,
  ADD COLUMN status_until timestamptz;   -- NULL = vô thời hạn
```

- Suspend = `status = 'blocked'` + `status_until`. Block = `blocked` + `status_until NULL`. Activate = `active`, xoá hai cột.
- Hết hạn: `sweeper` (đã chạy 10 phút / lần) chuyển `blocked` có `status_until <= now()` về `active` và ghi audit với actor `NULL`.
- Khi block / suspend: trong cùng transaction đổi status + audit, sau commit gọi `revokeAllSessions` và xoá cache session Redis. Access token hiện tại sống tới hết TTL của nó; refresh đã bị chặn bởi JOIN `status = 'active'`.
- `inactive` giữ nguyên nghĩa hiện tại, admin không đặt giá trị này.

**Khác với đề xuất gốc:**

- "Quản lý instructors" là bộ lọc role trên cùng danh sách, không phải màn riêng. Gắn instructor với course (bảng `catalog.course_instructor(course_id, user_id)` và quyền "chỉ sửa course của mình") **hoãn** tới khi có luồng instructor tự soạn nội dung (`future-plan.txt`: "bên tạo khóa học").
- Ban và suspend dùng chung `blocked`, không thêm giá trị enum.

### 03. Learning Management (`/admin/courses`, `/admin/catalog`, `/admin/enrollments`, `/admin/orders`)

**Courses** (giữ `CourseAdmin`): metadata, `publish_status`, `access_model`, offer. Thêm:

- `/admin/courses/[id]`: cây module → lesson → challenge. Sửa tiêu đề, `order_index`, `is_hidden`; xoá mềm (`is_deleted`). Mỗi lesson có link "Mở trong Studio" tới document Sanity tương ứng (`content_source`).
- Bộ đếm `modules / lessons` của course cập nhật trong cùng transaction khi ẩn / hiện (như `catalog.course_publish_sync` đang làm cho publish).
- Checklist trước khi publish (cảnh báo, không chặn): có module, mọi lesson có `content_source`, challenge coding có test case, có offer nếu `premium`.

**Catalog** (`/admin/catalog`): CRUD `catalog.category`, `catalog.language`, `catalog.skill`, `catalog.career_role` (+ `career_role_skill`), `catalog.industry`, `catalog.learning_goal`. Xoá chỉ khi không còn course tham chiếu, nếu không thì ẩn. Sau mỗi thay đổi xoá cache catalog (`dropCatalogCaches` trong `services/admin.service.js:41`).

**Enrollments** (từ phần entitlement của `AccessAdmin`): tra theo user hoặc course; xem `learning.register` (progress, status) cạnh `commerce.entitlement` (source, hạn, trạng thái); grant / revoke entitlement như hiện tại. Không sửa `progress` bằng tay (được tính từ `learning.user_progress`).

**Orders** giữ nguyên `OrdersAdmin`.

**Khác với đề xuất gốc:**

- Không có màn tạo lesson / sửa nội dung lesson: nội dung ở Sanity, cấu trúc course ở seed SQL. Admin chỉ sửa cấu trúc đã có.
- "Duyệt và publish" = đổi `publish_status` kèm checklist. Trạng thái `in_review` và hàng chờ duyệt hoãn cùng luồng instructor.

### 04. Challenge & Submission (`/admin/challenges`, `/admin/runs`)

**Challenges:** danh sách theo course / module, lọc `type` (quiz / coding), `status`, `difficulty`. Sửa `status` (`coming_soon / open / closed`), `is_published`, `points`. Ghép số liệu của `ContentKpiAdmin` (pass rate, số lần nộp trước khi pass) vào cùng bảng. Xem test case (`challenge_test_cases`) chỉ đọc; sửa test case vẫn qua seed.

**Runs** (`/admin/runs`): bảng `challenge.code_runs` lọc theo trạng thái, `run_type` (`manual / submit`), user, challenge, ngôn ngữ, khoảng thời gian; mặc định 24 giờ, hàng `queued / running` lên đầu. Cột: thời gian chờ (`started_at - queued_at`), thời gian chạy, `sandbox`, kết quả tóm tắt.

**Chi tiết run** (`/admin/runs/[id]`): source (`source_snapshot`), stdin, `code_run_results` (stdout, stderr, exit code, thời gian, bộ nhớ, số test pass), `code_run_test_results` theo test case, `error`, submission gắn kèm. Xem source cần `submission.read` và được ghi audit (`action = 'submission.view'`).

**Huỷ run lỗi** (`coderun.cancel`): `POST /api/admin/runs/[id]/cancel` gọi `codeRunDb.finish({ status: 'cancelled', error })`. Câu lệnh đó chỉ đổi row đang `queued / running`, nên:

- run còn chờ: step `start` của function `code-run` thấy row không hợp lệ và dừng;
- run đang chạy trong sandbox: kết quả về sau không ghi được vì `finish` có điều kiện; không cần gọi API huỷ của Inngest.
- Huỷ hàng loạt "mọi run quá hạn" dùng lại `codeRunDb.expireAll` (việc `sweeper` đang làm), cho trường hợp không muốn đợi chu kỳ 10 phút.

**Attempts:** trong chi tiết user và chi tiết challenge, đếm `code_submissions` theo (user, challenge), lần pass đầu, số gợi ý đã mở (`lib/hintUsage.js`). Không thêm bảng mới.

**Khác với đề xuất gốc:**

- Không có "chạy lại submission" phía admin: chạy lại sẽ đụng điểm, EXP và achievement đã cộng trong transaction chấm bài. Huỷ run hiện thông báo "không tính lượt" như `sweeper` đang làm; người học tự chạy lại.
- "Execution results" nằm trong chi tiết run, không tách màn.

### 05. System Monitoring (`/admin/system`, `ops.read`)

Một trang, các khối làm mới 60 giây (TanStack Query `refetchInterval`, chỉ khi tab đang hiển thị) và có nút làm mới tay, để không giữ Neon thức (2.2).

| Khối | Nội dung | Nguồn |
|---|---|---|
| Tổng quan | Trạng thái DB / Redis / storage / jobs, môi trường, provider storage | Hàm tính của `/api/health` (tách ra service để admin và probe dùng chung) |
| Hàng đợi chấm bài | Đang chờ, đang chạy, chờ lâu nhất, thời gian chạy trung bình, run 10 phút gần nhất theo trạng thái, theo `sandbox` | `codeRunDb.load()` + một query nhóm theo `sandbox` |
| Sandbox | Provider (`CODE_RUNNER_PROVIDER`), tỷ lệ `timeout / failed` 1 giờ và 24 giờ, lỗi gần nhất | `challenge.code_runs` |
| Inngest | Bật hay chưa (`inngestEnabled()`), danh sách function và cron từ `jobs/index.js`, lần chạy gần nhất của cron suy ra từ dữ liệu (`sweeper` → run hết hạn đã đóng; `exp-audit` → audit gần nhất), link Inngest Cloud | `lib/inngest.js`, `jobs/*` |
| Outbox | Chờ giao, đang retry (`attempts > 0`), đã chết (`dead_at`) | `identity.auth_outbox` |
| Dead letters | Danh sách mở, xem payload / lỗi, Resolve (ghi chú), Retry | `ops.dead_letters`; port logic từ `scripts/dlq.mjs`, `ops.resolve` |
| Database | Số kết nối theo trạng thái (`pg_stat_activity`), kích thước bảng lớn nhất, top query chậm từ `pg_stat_statements` (dùng lại truy vấn của `npm run db:baseline`, `db/tools/baseline.mjs`) | Query hệ thống, chỉ đọc |

**Khác với đề xuất gốc:**

- "API health" = `/api/health` có sẵn cho trạng thái hiện tại; uptime theo thời gian và latency từng route nằm ở Grafana (G2, G3 trong 6.3).
- Mỗi khối có link "Open in Grafana" tới dashboard tương ứng (6.5).
- "Worker status" = Inngest + sandbox, vì không có worker process riêng.
- "Error logs và incidents" thu về dead letter + run lỗi + outbox chết trong admin; log và lịch sử cảnh báo ở Grafana. Không làm bảng incident.

### 06. Platform Settings (`/admin/settings/*`)

**Roles & Permissions** (`/admin/settings/roles`):

- Ma trận role × permission **chỉ đọc** ở bản đầu; gán role cho user làm ở chi tiết user (module 02).
- Sửa ma trận làm sau, chỉ cho `super_admin` (`role.manage`), mọi thay đổi ghi audit. Lý do hoãn: permission được code dùng trực tiếp (`requirePermission(userId, "course.price")`), nên tạo permission mới từ UI không có tác dụng; đổi quyền nên đi bằng migration để review được.
- Dọn quyền cũ theo A6 ở phần 3.1.

**Audit logs** (`/admin/audit`, kiểu trang Logs ở 5.5): giữ `AuditLog`, thêm lọc theo actor, action, target, khoảng ngày, xem diff `before / after`, phân trang keyset. Bảng append-only, không có nút xoá.

**Configuration** (`/admin/settings/general`, `storage`, `mail`, `limits`, `observability`) chỉ đọc, không bao giờ hiện giá trị bí mật:

- Môi trường và kết quả `checkEnvironment()` (cảnh báo, lỗi).
- Storage: provider, bucket, trạng thái kiểm tra (`storageInfo()`, `checkStorage()`).
- Mail: transport đang dùng (`lib/mailConfig.mjs`).
- Giới hạn: kích thước input, thời gian job, rate limit quiz / run / submit, cooldown quiz (đọc từ `lib/challenges/limits.js`, `lib/rateLimit.js`).

**Khác với đề xuất gốc:**

- "Platform / Storage / Feature settings" gộp thành một trang chỉ đọc. Đổi cấu hình vẫn qua env và deploy.
- Bảng feature flag (`ops.settings`) chỉ làm khi có một cờ cụ thể cần bật tắt lúc chạy; hiện chưa có.

### 07. Thanh toán (học tập và thử nghiệm)

Thanh toán hiện chạy được và đủ cho mục đích học tập: provider `mock` có webhook ký HMAC (`services/payments/index.js`), webhook `app/api/webhooks/payments/[provider]/route.js`, hàm DB `public.apply_payment_event`, admin có Orders và hoàn điểm. Không có kế hoạch thu tiền thật.

**Admin cho thanh toán** (mở rộng màn Orders, kiểu danh sách Deployments), dùng được ngay với `mock`:

| Màn / khối | Nội dung | Quyền |
|---|---|---|
| Payments | Danh sách `commerce.payment`: provider, số tiền, trạng thái, đơn liên quan, thời điểm; chi tiết có các `commerce.payment_event` (payload chỉ xem với `payment.reconcile`) | `payment.read` |
| Webhook lỗi | Sự kiện bị từ chối (chữ ký sai, payload sai) và lần xử lý lỗi, để thử và gỡ lỗi luồng webhook | `payment.read` |

**Tuỳ chọn để học: tích hợp SePay ở chế độ thử.** Nếu muốn học luồng chuyển khoản VietQR thật, thêm provider `sepay` vào cùng lớp provider ([tài liệu](https://developer.sepay.vn/en/sepay-webhooks/bat-dau-nhanh)):

- `createCheckout`: mã thanh toán ngắn, duy nhất cho mỗi payment, trang hiển thị VietQR với đúng số tiền và nội dung chuyển khoản.
- `parseWebhook`: kiểm HMAC-SHA256 hoặc header `Authorization: Apikey …` (so sánh constant-time) trước khi đọc body; bỏ qua `transferType = out`; tìm mã thanh toán trong nội dung chuyển khoản; `eventId` = mã giao dịch SePay; số tiền là VND.
- Route webhook trả `{"success": true}` theo yêu cầu của SePay (hiện trả `{"received": true}`), nên mỗi provider tự định nghĩa phản hồi thành công.
- Admin thêm khối "Unmatched transfers" (tiền vào không khớp đơn, ghép tay có lý do, quyền `payment.reconcile`).
- Chỉ bật ở local và staging với số tiền nhỏ hoặc môi trường thử của SePay; production giữ `mock`. Nếu một ngày thu tiền thật thì phải xem lại hosting: Vercel Hobby không cho dùng thương mại, và Neon Free tạm dừng DB khi hết hạn mức.

**Khác với đề xuất gốc:** không có trong 6 module ban đầu; thêm vì luồng thanh toán đã có trong code và cần màn xem lại khi thử.

## 5. Thiết kế UI/UX: theo kiểu dashboard Vercel

### 5.1 Nguồn và quyết định

- **Mẫu là dashboard Vercel hiện tại.** Từ 26/02/2026 Vercel bỏ tab ngang, dùng sidebar kéo giãn được và ẩn được; trên điện thoại là thanh nổi ở đáy, dùng một tay; cùng một bộ link ở cấp team và cấp project, chuyển giữa hai cấp bằng một click ([changelog](https://vercel.com/changelog/dashboard-navigation-redesign-rollout)). Lấy từ Vercel **cấu trúc và cách cư xử** (shell, danh sách kiểu Deployments, trang chi tiết kiểu deployment, trang Logs, thẻ Settings có thanh chân, status dot, ⌘K), **không** lấy logo, chữ hay tên sản phẩm của Vercel.
- **Màu và chữ vẫn là của CodeDev** (`app/globals.css`, Plus Jakarta Sans, JetBrains Mono). Không thêm Geist: ba font là quá nhiều, và admin phải nhìn như cùng một sản phẩm với trang học.
- **Tinh thần đơn sắc như Vercel:** nút primary là mực đậm (`--foreground` làm nền, chữ `--background`), không phải violet. Violet chỉ còn ở logo, focus ring, chuỗi dữ liệu chính của biểu đồ và link trong nội dung. Như vậy vừa giống Vercel vừa đúng ngân sách màu dưới 3% của taste-skill.
- **taste-skill:** shell theo kiểu **Open plane** của `references/app-screens.md` §3.1 (sidebar trên nền trang, ngăn bằng một đường 1px), vì brief giờ chỉ định Vercel. Các quy tắc còn lại của chương app screens (KPI là chữ, bảng là kẻ và căn lề, màu chỉ trên dữ liệu, trạng thái rỗng / lỗi thật) giữ nguyên. Pattern overview của sheet devtools ("deploy hiện tại và sức khoẻ dẫn đầu") vẫn dùng cho Overview.
- **impeccable, chế độ Operate:** quen thuộc hơn lạ; đủ bảy trạng thái cho mọi control; ưu tiên inline và drawer hơn modal.
- **Hệ design hiện có:** `docs/ui-ux/DESIGN_SYSTEM_SPEC.md`, `docs/ui-ux/QA_AND_ACCESSIBILITY.md`, primitive `components/shadcn/*` (`sidebar`, `table`, `tabs`, `sheet`, `alert-dialog`, `dialog`, `skeleton`, `kbd`, `empty`, `breadcrumb`, `sonner`).

### 5.2 Shell

```
┌──────────────────────────┬──────────────────────────────────────────────────────────┐
│ [logo] CodeDev Admin  ⌄  │  Users / cuong.coder                    [Production]  (?) │  48px, kẻ 1px dưới
│ [ Find…            ⌘K ]  ├──────────────────────────────────────────────────────────┤
│                          │                                                            │
│ Overview                 │   cuong.coder  ● Active                 [Suspend] [ ⋯ ]    │  h1 24/600
│ Users                    │   Joined 2026-08-12 · last active 3 h ago                  │
│ Courses                  │                                                            │
│ Challenges               │   ┌──────────────────────────────────────────────────┐     │
│ Runs                 12  │   │ thẻ tóm tắt: các ô facts chia bằng đường 1px       │     │
│ Enrollments              │   └──────────────────────────────────────────────────┘     │
│ Orders                   │   Activity   Learning   Runs   Sessions                    │  tab gạch chân 2px
│ Audit                    │   ─────────────────────────────────────────────────        │
│ System               3   │   nội dung, rộng tối đa 1200px, padding 24                 │
│                          │                                                            │
│ Settings                 │                                                            │
│ ← Back to CodeDev        │                                                            │
│ (avatar) cuong  ☾        │                                                            │
└──────────────────────────┴──────────────────────────────────────────────────────────┘
```

- **Sidebar** 240px trên nền `--sidebar`, ngăn với nội dung bằng 1px `--sidebar-border`. Kéo giãn từ 200 đến 320px; ẩn / hiện bằng nút ở top bar và phím ⌘B / Ctrl B; độ rộng và trạng thái ẩn nhớ trong `localStorage` (bọc try/catch, mất thì về mặc định). Primitive `components/shadcn/sidebar.jsx` đã có phần lớn hành vi này.
- **Đầu sidebar:** logo CodeDev và "Admin", mũi tên mở menu phạm vi (xem dưới); ô "Find…" có gợi ý ⌘K ngay dưới, như Vercel.
- **Mục điều hướng:** một danh sách phẳng, sắp theo tần suất dùng; mỗi mục một icon outline 16px và nhãn 14px. Mục đang chọn là nền xám trung tính `--sidebar-accent`, chữ giữ màu mực; không có thanh màu bên trái. Chỉ hiện mục người dùng có quyền (`lib/adminPermissions.js`). Số chỉ đặt trên hàng đợi cần xử lý: "Runs 12" là run đang chờ / chạy, "System 3" là dead letter đang mở; tooltip nói rõ danh từ.
- **Đáy sidebar:** Settings, "Back to CodeDev", hàng tài khoản (avatar, tên, nút đổi sáng / tối).
- **Phạm vi, theo cách team / project của Vercel:** cấp nền tảng là mặc định. Khi mở một course hoặc một user, breadcrumb thành `Courses / <tên course>` và sidebar giữ nguyên bộ link; các màn có bản theo đối tượng (Runs, Enrollments, Audit) lọc sẵn theo course / user đó, và một click trên chip phạm vi ở đầu màn ("Scoped to Python Foundations ✕") trả về cấp nền tảng. Không làm hai bộ điều hướng.
- **Top bar 48px:** breadcrumb bên trái; chip môi trường bên phải (Production dùng cặp `warning-soft`, Development trung tính) để không thao tác nhầm trên production (production còn có dải cảnh báo ở mép trên và tiền tố "PROD ·" trong tiêu đề tab, 2.1); nút trợ giúp. Không có ô tìm kiếm thứ hai, không có chuông.
- **Vùng nội dung:** nền `--background`, rộng tối đa 1200px, căn trái theo sidebar (không căn giữa cửa sổ), padding 24px.
- **Đầu màn:** `h1` 24/600 là danh từ; dòng 14px xám nói phát hiện quan trọng nhất của dữ liệu; bên phải tối đa một nút primary mực đậm, một nút phụ viền 1px, và kebab cho phần còn lại. Tem cập nhật ("Updated 14:05" + nút làm mới) trên màn có dữ liệu sống.

### 5.3 Token và chữ

| Vai trò | Token CodeDev |
|---|---|
| Sidebar, top bar | `--sidebar`, viền `--sidebar-border` |
| Nền nội dung | `--background` |
| Thẻ, container của danh sách | `--card`, viền 1px `--border`, bo 8px (`--radius`), không đổ bóng |
| Thanh chân của thẻ Settings | `--muted` |
| Kẻ giữa các hàng trong container | `--border` |
| Viền control | `--input` (đạt 3:1) |
| Chữ chính / phụ | `--foreground` / `--muted-foreground` (4.5:1, kể cả placeholder) |
| Nút primary | nền `--foreground`, chữ `--background` (đảo ngược ở dark) |
| Chuỗi dữ liệu chính, link trong nội dung | `--primary-ink` |
| Status dot và pill | `success`, `warning`, `destructive`, `info` và các cặp `-soft` |
| Output, mã code | token `editor*` |

- **Status dot kiểu Vercel:** chấm tròn 8px kèm nhãn chữ, không bao giờ chỉ có chấm. Bảng ánh xạ dùng chung cho mọi màn:

| Đối tượng | Xanh (`success`) | Vàng (`warning`) | Đỏ (`destructive`) | Xám |
|---|---|---|---|---|
| Code run | Completed | Running | Failed, Timeout | Queued, Cancelled |
| User | Active | Suspended (có hạn) | Blocked | Unverified |
| Course | Published | Draft | Archived | Unpublished |
| Dịch vụ | Healthy | Degraded | Down | Unknown |
| Dead letter | Resolved | | Open | |

- **Font:** Plus Jakarta Sans cho mọi thứ; JetBrains Mono cho đúng một việc: ID, timestamp trong trang kiểu Logs, mã code và stdout. Số trong bảng dùng `tabular-nums`; nếu Plus Jakarta không đổi độ rộng chữ số thì cột số dùng `font-mono tabular` như design spec.
- **Thang chữ** 12 / 14 / 16 / 24; KPI 24px, số trả lời câu hỏi của màn 30px; không gì từ 34px trở lên.
- **Mật độ** như Vercel: hàng danh sách 56–64px khi có hai dòng, 44px khi một dòng; control 32px; padding thẻ 16–24px; một khoảng cách 16px giữa các khối.
- **Bo góc:** thẻ 8, control 6, chip 4, avatar tròn.

### 5.4 Mẫu màn mượn từ Vercel

| Mẫu Vercel | Màn CodeDev |
|---|---|
| Project Overview: thẻ production deployment rồi các khối dưới | Overview |
| Deployments: một container, mỗi hàng là một deployment (status dot, commit, nhánh, thời lượng, ai, bao lâu trước), bộ lọc trên đầu | Runs, Users, Courses, Challenges, Orders |
| Deployment detail: thẻ tóm tắt facts, rồi tab Build Logs / Source / Resources | Run detail, User detail, Course detail |
| Logs: cột lọc bên trái, bảng log font mono, bấm một dòng mở drawer chi tiết bên phải | Audit, dead letters trong System |
| Settings: menu dọc bên trái, mỗi mục là một thẻ (tiêu đề, mô tả, control, thanh chân xám có chữ gợi ý trái và nút Save phải), thẻ Danger ở cuối viền đỏ | Settings, phần nguy hiểm của User detail và Course detail |
| ⌘K command menu | Find: tìm và nhảy tới user, course, run, màn; chạy lệnh ("Cancel run…", "Go to System") |
| Toast góc dưới phải | `sonner` có sẵn, chỉ để xác nhận |

### 5.5 Từng màn

| Màn | Câu hỏi trả lời trước | Khối lớn nhất | Việc chính |
|---|---|---|---|
| Overview | Nền tảng có ổn không, hôm nay có gì cần xử lý? | Thẻ "Production" + "Needs attention" | Mở mục cần xử lý |
| Users | Ai đang bị khoá, ai cần xem? | Danh sách user | Mở chi tiết |
| User detail | Người này là ai, đã làm gì, có quyền gì? | Thẻ tóm tắt + tab Activity | Suspend / Activate |
| Courses / Course detail | Course nào sẵn sàng publish, còn thiếu gì? | Cấu trúc + checklist | Publish / Unpublish |
| Challenges | Challenge nào quá khó hoặc hỏng? | Danh sách kèm pass rate | Đổi trạng thái |
| Runs | Có run nào kẹt hoặc lỗi hàng loạt? | Dải hàng đợi + danh sách | Cancel run kẹt |
| Run detail | Run chạy ra sao, vì sao lỗi? | Thẻ tóm tắt + tab Output | Cancel khi còn chạy |
| Audit | Ai đã làm gì, khi nào? | Bảng kiểu Logs | Lọc, mở chi tiết |
| System | Phần nào đang xuống cấp? | Dải dịch vụ + dead letters | Resolve / Retry |
| Settings | Ai có quyền gì, cấu hình đang là gì? | Thẻ settings | Đọc ma trận quyền |

**Overview.**

1. **Thẻ "Production"** (tương đương thẻ production deployment của Vercel), dữ liệu thật từ biến môi trường hệ thống của Vercel (`VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_GIT_COMMIT_REF`; local không có thì ẩn ô đó). Bên trái: commit message 16/600, nhánh, SHA 7 ký tự font mono có nút copy, thời điểm deploy. Bên phải: các ô facts chia đường 1px gồm Database, Cache, Storage, Jobs, mỗi ô một status dot và một dòng chi tiết ("p50 4 ms", "Upstash", "S3", "2 dead letters"). Nút phụ "Open in Grafana".
2. **Dải KPI** trong một container chia ô: Active learners (24 h), Submissions today, Runs today (kèm tỷ lệ lỗi), New sign-ups (7 days). Thay đổi ghi bằng chữ kèm mốc ("+14 vs yesterday"), màu theo tốt / xấu; 0 hoặc không có mốc là xám hoặc "—". Không sparkline, không icon trong ô màu.
3. **Hàng hai cột:** biểu đồ submissions 14 ngày ở 2/3 (một chuỗi `--primary-ink`, ngày bất thường có vạch 1px và nhãn) và "Needs attention" ở 1/3: dead letter đang mở, run quá hạn, tài khoản chưa verify sắp bị xoá, course draft đã đủ checklist; mỗi dòng có hành động.
4. **Hàng hai cột cao bằng nhau:** course theo `publish_status`, và 6 dòng audit gần nhất ("View all").

**Danh sách (Users, Runs, Courses, Challenges, Orders)**, một khuôn duy nhất như trang Deployments:

- Thanh lọc trên đầu: ô tìm 280×32, các bộ lọc dạng nút có menu (Status, Role, Language, Date range), bên phải tổng ("1,284 users") và sắp xếp. Bộ lọc ghi vào query string (không chứa email hay dữ liệu cá nhân), nên link chia sẻ được và nút Back hoạt động.
- Một container `--card` viền 1px, các hàng ngăn bằng đường 1px, không header band, không zebra. Mỗi hàng hai dòng: dòng 1 là định danh và status dot; dòng 2 13px xám là thông tin phụ; cột phải là thời gian tương đối và kebab. Cả hàng là link tới chi tiết.
- Ví dụ hàng run: `● Failed   7f3a2c1e  Two Sum · Python  ·  waited 3 s · ran 12 s     2 m ago  cuong.coder  ⋯`. Run đang chạy có nút ghost "Cancel" ở cột cuối cố định.
- Cuối danh sách: "Load more" và "1–50 of 1,284" (keyset).
- **Dải hàng đợi chấm bài** (thứ chỉ CodeDev có) đứng trên danh sách Runs: mỗi sandbox một dòng gồm queued, running, chờ lâu nhất, thời gian chạy trung bình 10 phút; chờ quá ngưỡng (60 s) chuyển màu cảnh báo kèm chữ.

**Chi tiết (Run, User, Course)**, một khuôn như trang deployment:

- Đầu màn: tên, status dot, hành động.
- Thẻ tóm tắt: lưới facts chia đường 1px. Run: Status, Learner, Challenge, Language, Sandbox, Waited, Ran, Created. User: Status, Roles, Joined, Last active, Email (che nếu thiếu `user.pii`), Points, EXP, Sessions. Course: Status, Access, Level, Modules, Lessons, Enrolled, Updated.
- Tab gạch chân 2px trên một đường 1px:
  - Run: **Output** (nền `editor`, Stdout / Stderr, font mono), **Tests** (bảng test case, số lớn "5 / 7 passed"), **Source** (chỉ hiện sau khi bấm "Show source", nút nói rõ lần xem được ghi audit), **Timeline** (queued, running, completed kèm giờ).
  - User: **Activity** (timeline gộp, lọc theo loại), **Learning** (khoá học, entitlement), **Runs**, **Sessions** (thu hồi), **Roles** (gán / gỡ theo bậc; role không gán được vẫn hiện, disabled kèm lý do "Requires super admin").
  - Course: **Structure** (cây module, lesson, challenge; công tắc hiện / ẩn; nút lên / xuống; "Open in Studio"), **Checklist**, **Pricing** (offer), **Enrollments**.
- Cuối trang User và Course là thẻ Danger viền `destructive` theo kiểu Vercel: "Block account" / "Archive course", câu hậu quả và nút viền đỏ.

**Audit (kiểu trang Logs).**

- Cột lọc 240px bên trái: khoảng thời gian (preset 1 h, 24 h, 7 ngày, tuỳ chọn), Actor, Action (nhóm theo resource, có số đếm), Target type.
- Bảng chính font mono cho thời gian: `2026-10-31 14:05:12  user.status  cuong.coder → minh.le  "spam in comments"`. Bấm một dòng mở `sheet` bên phải với before / after theo từng khoá (khoá đổi được đánh dấu), IP (nếu có `user.pii`) và link tới đối tượng.
- Dead letters trong System dùng cùng khuôn này với lọc source / kind / mở / đã xử lý.

**System.** Thẻ dịch vụ như thẻ Production; dải hàng đợi; dead letters kiểu Logs có Resolve / Retry; outbox (pending / retrying / dead); database (kết nối, bảng lớn nhất, query chậm từ `pg_stat_statements`). Mỗi khối có link "Open in Grafana" tới dashboard tương ứng (mục 6). Tự làm mới 60 s khi tab đang hiển thị (2.2).

**Settings (kiểu Vercel).** Menu dọc bên trái: General (cấu hình chỉ đọc), Roles & Permissions, Storage, Mail, Limits, Observability (link Grafana, trạng thái các nguồn dữ liệu). Mỗi mục là một thẻ: tiêu đề 16/600, mô tả 14px xám, nội dung, thanh chân `--muted` có chữ gợi ý bên trái ("Changes are made through environment variables and a redeploy.") và nút bên phải khi có. Ma trận quyền là bảng permission × role với dấu ✓ chữ.

### 5.6 Quy tắc chung

**Giao diện theo quyền.**

- Thiếu quyền cả tính năng: ẩn mục sidebar và nút.
- Có quyền tính năng nhưng không áp dụng cho đối tượng này (role cao hơn mình, super admin cuối cùng): hiện control ở trạng thái disabled kèm lý do bằng chữ cạnh control, không chỉ trong tooltip.
- API trả 403 giữa chừng (quyền vừa bị gỡ): báo lỗi ngay trong khối đó ("You no longer have permission to do this"), tải lại quyền của actor, không văng ra trang lỗi.

**Hành động nhạy cảm và phá huỷ.**

- Dùng `alert-dialog` có sẵn. Dialog nêu tên đối tượng ("Block cuong.coder?"), hậu quả bằng chữ ("Signs them out of 3 sessions. They cannot sign in until an admin activates the account."), ô lý do bắt buộc (tối thiểu 10 ký tự, ghi vào audit).
- Block, gỡ role `admin` / `super_admin`, huỷ hàng loạt: gõ lại username hoặc số lượng để xác nhận.
- Nút xác nhận gọi đúng việc ("Block account", "Cancel 12 runs"), không phải "OK"; nút huỷ là mặc định khi nhấn Enter.
- Sau khi xong: hàng cập nhật tại chỗ, toast chỉ để xác nhận. Việc đảo ngược được (suspend) đảo ngược bằng hành động ngược (Activate), không có Undo ngầm.

**Trạng thái của mọi khối.**

- Loading: khung cuối cùng với thanh xám phẳng đúng kích thước giá trị (`skeleton`), không shimmer, không xô lệch khi dữ liệu về.
- Rỗng: giữ khung và tiêu đề, một câu bằng ngôn ngữ của việc ("No runs waiting. The queue is clear.").
- Lỗi: trong khối bị lỗi, một câu nói cái gì hỏng và lần cuối dữ liệu tốt ("Couldn't load dead letters. Last updated 14:05."), nút "Retry". Không banner toàn màn.
- Số 0 in là 0; không có giá trị là "—" xám; số căn phải, có dấu phân cách hàng nghìn, thời lượng "48 s", "1 m 12 s"; ngày ISO trong bảng, tương đối cho "last active"; giờ theo múi giờ của trình duyệt, tooltip ghi UTC.

**Biểu đồ.** Trong admin chỉ có vài biểu đồ nhỏ; không thêm thư viện: component SVG nhỏ theo quy tắc của taste-skill (§6). Một chuỗi, một hue mỗi biểu đồ; 3–5 đường lưới mờ, không trục y; nhãn trục không xoay; không legend cho một chuỗi; đánh dấu sự kiện bất thường bằng vạch 1px và nhãn; luôn kèm `aria-label` tóm tắt và một bảng số liệu ẩn cho trình đọc màn hình.

**Bàn phím và trợ năng.** WCAG 2.2 AA theo `QA_AND_ACCESSIBILITY.md`; ⌘K / Ctrl K mở tìm kiếm; cả hàng bảng là link tới chi tiết; focus ring `--ring` luôn thấy; dialog giữ focus và trả về nút đã mở nó; pill trạng thái luôn có chữ, không dựa vào màu; vùng tự làm mới dùng `aria-live="polite"` và chỉ thông báo khi trạng thái đổi.

**Điện thoại và tablet.** Admin dùng chủ yếu trên desktop, nhưng production mở được từ điện thoại nên phải xem được và làm được việc khẩn (huỷ run, khoá user). Từ 768 đến 1100px sidebar tự ẩn, mở lại bằng nút ở top bar. Dưới 768px dùng thanh nổi ở đáy như Vercel: Overview, Users, Runs, System và "More" mở `sheet` chứa các mục còn lại; thanh cách mép 12px, chừa vùng an toàn, không che nội dung (thêm padding đáy bằng chiều cao thanh); dưới 640px danh sách giữ dạng hai dòng (định danh và số chính ở dòng 1, trường khác 13px xám ở dòng 2, hành động bên phải); thẻ tóm tắt của trang chi tiết thành các hàng nhãn / giá trị; vùng chạm tối thiểu 44px.

**Chuyển động.** 150–200 ms cho thay đổi trạng thái (hover, mở menu, hàng mới xuất hiện); không có hiệu ứng vào trang; tôn trọng `prefers-reduced-motion`.

### 5.7 Kiểm khi dựng

Mỗi màn trước khi xong pha:

1. `node <taste-skill>/scripts/lint.mjs --app components/admin app/admin`
2. `node <taste-skill>/scripts/inspect.mjs --app <url>`, ở 1440, 768, 390; sửa mọi `FAIL`, giải thích được từng `WARN`. Chạy trên `next build && next start`, không chỉ dev server.
3. `impeccable detect --json <file đã đổi>`.
4. axe 0 lỗi ở sáng và tối (đặt `localStorage.theme` rồi tải lại, theo ghi chú trong QA doc).
5. Đọc ảnh chụp từng độ rộng và trả lời 7 câu kiểm của taste-skill §2.7 (khối lớn nhất có trả lời câu hỏi không, các cạnh có thẳng không, màu có chỉ nằm trên dữ liệu không, số có khớp nhau không…).
6. Đặt ảnh chụp cạnh màn Vercel tương ứng (Deployments, deployment detail, Logs, Settings) và kiểm: cùng mật độ, cùng cách dùng status dot, cùng vị trí hành động; khác ở màu và font của CodeDev là đúng.
7. Dữ liệu mẫu cho demo phải cộng đúng (tổng tính từ hàng), không "John Doe", không số làm đẹp.

## 6. Observability với Grafana

### 6.1 Chia việc giữa admin và Grafana

| Việc | Ở đâu | Lý do |
|---|---|---|
| Hành động: khoá user, huỷ run, resolve / retry dead letter, publish | Admin | Cần RBAC của CodeDev, lý do bắt buộc và audit trong cùng transaction |
| Trạng thái hiện tại tóm tắt | Admin | Thấy ngay và bấm được |
| Chuỗi thời gian, so sánh nhiều ngày, phân vị, log, trace | Grafana | Grafana làm việc này tốt hơn mọi thứ tự viết |
| Cảnh báo | Grafana Alerting của môi trường production | Chạy 24/7 |

Admin không nhúng Grafana (nhúng cần dashboard công khai hoặc đăng nhập ẩn danh). Mỗi khối của màn System có link "Open in Grafana" tới dashboard và khoảng thời gian tương ứng, lấy từ `GRAFANA_URL` của môi trường đó; chưa đặt thì ẩn link.

### 6.2 Hai nơi chạy, một bộ dashboard

| | Local | Production (Vercel) |
|---|---|---|
| Grafana | Docker profile `monitoring` trên máy dev | Grafana Cloud Free |
| Truy cập | `http://127.0.0.1:3001` | Tài khoản Grafana Cloud mời theo email, bật 2FA |
| Dữ liệu | DB local qua `grafana_ro` (G1), probe `localhost` (G2) | DB production qua `grafana_ro` (G1), Synthetic Monitoring (G2), OpenTelemetry (G3) |
| Cảnh báo | Tắt, hoặc gửi vào Mailpit để thử rule | Bật 24/7 |
| Nạp dashboard | Provisioning từ `monitoring/grafana/` | `npm run grafana:push` (API, token service account) |

Dashboard, rule cảnh báo và data source lưu một lần trong `monitoring/grafana/`, review như code. Mỗi dashboard có biến `env` chọn data source, nên cùng một file JSON chạy được ở cả hai nơi.

```
monitoring/
  grafana/provisioning/datasources/datasources.yml   PostgreSQL local, Prometheus
  grafana/provisioning/dashboards/dashboards.yml
  grafana/provisioning/alerting/rules.yml
  grafana/dashboards/*.json
  prometheus/prometheus.yml
  blackbox/blackbox.yml
scripts/grafana-push.mjs                             đẩy dashboard + rule lên Grafana Cloud
```

**Profile `monitoring` trong `compose.yml`**, cùng phong cách các service hiện có (ảnh ghim phiên bản, chỉ publish cổng loopback, không bí mật trong ảnh):

| Service | Cổng | Việc |
|---|---|---|
| `grafana` (`grafana/grafana-oss`, ghim) | `127.0.0.1:3001` | Dashboard, alerting. `GF_USERS_ALLOW_SIGN_UP=false`, `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_ANALYTICS_REPORTING_ENABLED=false` |
| `prometheus` (`prom/prometheus`, ghim) | không publish | Chuỗi thời gian của blackbox; giữ 15 ngày |
| `blackbox-exporter` (`prom/blackbox-exporter`, ghim) | không publish | Gọi `/api/health` của app local |

```bash
npm run monitoring:up      # docker compose --env-file .env.local --profile monitoring up -d
npm run monitoring:down
```

Volume `codedev_grafana-data`, `codedev_prometheus-data`.

### 6.3 Nguồn dữ liệu

| # | Nguồn | Vào Grafana bằng | Local | Production |
|---|---|---|---|---|
| G1 | PostgreSQL | Data source PostgreSQL, role `grafana_ro`, schema `metrics` (6.4) | DB local | Neon branch `production`, `sslmode=require` |
| G2 | `/api/health` | Blackbox exporter / Synthetic Monitoring | `localhost:3000` | `/api/health?probe=live` 5 phút / lần; báo cáo đầy đủ (header `Authorization: Bearer $HEALTH_TOKEN`) 60 phút / lần (6.4) |
| G3 | OpenTelemetry của app | `@vercel/otel` trong `instrumentation.js`, OTLP | Tuỳ chọn (6.7) | Gửi thẳng tới OTLP của Grafana Cloud, lấy mẫu 10% |

- `/api/health` hiện trả `{ status }` cho mọi người sau một `SELECT 1`, và báo cáo đầy đủ khi có `HEALTH_TOKEN`. Tham số mới `?probe=live` trả 200 mà **không** truy vấn DB, để probe 5 phút không đánh thức Neon.
- G3 là dependency mới duy nhất; không đặt `OTEL_EXPORTER_OTLP_ENDPOINT` thì không gửi gì.
- Không dùng được ở gói hiện tại: số liệu Inngest (Prometheus export cần gói trả phí), Neon OpenTelemetry (cần Scale), Vercel Drains (cần Pro).
- Không làm endpoint `/api/metrics` kiểu Prometheus: trên Vercel mỗi request có thể ở một instance khác nhau.

### 6.4 Schema `metrics` và role chỉ đọc

Grafana không đọc bảng nghiệp vụ. Migration tạo schema `metrics` gồm các view đã gộp, **không có dữ liệu cá nhân** (không email, username, IP, source code), rồi cấp `USAGE` / `SELECT` cho role `grafana_ro` nếu role tồn tại. Role và mật khẩu tạo bằng tay ở mỗi môi trường (Neon console cho production, `psql` cho local), không nằm trong migration. Cùng migration chạy ở cả hai nơi (`db:migrate`, `db:migrate:prod`).

| View | Cột chính |
|---|---|
| `metrics.code_runs_5m` | thời điểm (5 phút), `status`, `run_type`, `language`, `sandbox`, số run, p50 / p95 chờ và chạy |
| `metrics.code_runs_active` | số `queued`, `running`, chờ lâu nhất (giây) |
| `metrics.outbox` | pending, retrying, dead, cũ nhất |
| `metrics.dead_letters_daily` | ngày, `source`, `kind`, mở / đã xử lý |
| `metrics.learning_daily` | ngày, submissions (code / quiz), tỷ lệ pass, đăng ký course, số user hoạt động |
| `metrics.signups_daily` | ngày, đăng ký, đã verify, bị xoá do không verify |
| `metrics.orders_daily` | ngày, đơn theo trạng thái, điểm đã dùng |
| `metrics.db_activity` | kết nối theo trạng thái, bảng lớn nhất (từ `pg_stat_activity`, `pg_stat_user_tables`) |

- Role `grafana_ro`: `statement_timeout = '5s'`, `default_transaction_read_only = on`, tối đa 3 kết nối; connection string riêng (Neon: pooled).
- Thêm index `code_runs (queued_at)` cùng migration.
- **Hạn mức Neon Free (100 CU-hours / tháng):** compute nhỏ nhất 0.25 CU; thức cả tháng là khoảng 0.25 × 730 ≈ 182 CU-hours, gần gấp đôi hạn mức. Mỗi query đánh thức compute thêm ít nhất 5 phút, và hết hạn mức thì **cả trang học ngừng chạy** tới tháng sau. Vì vậy monitoring production không được giữ Neon thức:
  - Probe uptime 5 phút gọi `/api/health?probe=live`: tham số mới, trả 200 khi function sống mà không truy vấn DB, Redis hay storage. `/api/health` đầy đủ chỉ probe 60 phút một lần.
  - Rule cảnh báo đọc DB qua `grafana_ro` chạy 60 phút một lần, gộp vào một query.
  - Dashboard production không tự làm mới (mặc định tắt auto-refresh), khoảng thời gian mặc định 24 h.
  - Theo dõi mục Usage của Neon hằng tuần trong tháng đầu bật monitoring.

### 6.5 Dashboard

| Dashboard | Panel |
|---|---|
| CodeDev / Overview | uptime và thời gian phản hồi `/api/health`, run theo trạng thái, dead letter mở, submissions hôm nay |
| CodeDev / Code runs | run / 5 phút theo trạng thái, p50 / p95 chờ và chạy, theo sandbox và ngôn ngữ, tỷ lệ timeout |
| CodeDev / Jobs | outbox, dead letter theo kind, run của cron (từ bảng job) |
| CodeDev / Learning | submissions, pass rate, đăng ký, sign-up và verify theo ngày |
| CodeDev / Database | `metrics.db_activity`, query chậm từ `pg_stat_statements` |
| CodeDev / Requests | độ trễ p95 theo route, tỷ lệ 5xx, trace mẫu (G3) |

Biểu đồ theo cùng quy tắc với admin: một hue cho chuỗi chính, ngưỡng là đường gạch, đơn vị ghi rõ.

### 6.6 Cảnh báo (production)

| Cảnh báo | Điều kiện | Mức |
|---|---|---|
| Site down | probe `/api/health?probe=live` thất bại 2 lần liên tiếp | Gấp |
| Hàng đợi kẹt | chờ lâu nhất > 60 s ở lần đọc 60 phút / lần (`sweeper` đã tự đóng run quá hạn mỗi 10 phút; cảnh báo này bắt trường hợp hàng đợi kẹt kéo dài) | Gấp |
| Dead letter mới | có dead letter mở mới | Cảnh báo |
| Timeout tăng | tỷ lệ `timeout` > 10% trong 15 phút, ít nhất 20 run | Cảnh báo |
| Outbox dồn | pending > 50 hoặc có row `dead_at` mới | Cảnh báo |
| Health degraded | probe `/api/health` đầy đủ trả `degraded` | Cảnh báo |
| Lỗi 5xx tăng | tỷ lệ 5xx > 2% trong 10 phút (G3) | Cảnh báo |

Gửi qua email và Discord / Slack webhook. Mỗi cảnh báo kèm link dashboard và link màn admin xử lý (`https://<domain>/admin/runs?status=queued`). Local dùng cùng file rule nhưng gửi vào Mailpit (`127.0.0.1:1025`) để thử, hoặc tắt.

### 6.7 Truy cập và đề xuất thêm

- **Tài khoản Grafana không liên quan RBAC của CodeDev.** Danh sách người được mời vào Grafana production phải khớp với người có `ops.read`; thêm bước "gỡ khỏi Grafana" vào quy trình gỡ role, rà lại mỗi tháng. Đăng nhập Grafana bằng tài khoản CodeDev (OAuth) để hoãn.
- **Trace khi phát triển:** thêm Tempo vào profile `monitoring` và đặt `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` trong `.env.local` để xem query chậm trong một request. Hoãn tới khi cần.
- **SLO** khi đã có G2 và G3: `/api/health` sẵn sàng 99.5% / 30 ngày; 95% run nộp bài có kết quả dưới 30 s.
- **Grafana Faro** (lỗi JavaScript, Web Vitals phía trình duyệt): hoãn, cần cân nhắc quyền riêng tư.

## 7. Giai đoạn

| Pha | Nội dung | Migration |
|---|---|---|
| P0 | **Vá A1 trước tiên** (đã xác nhận trên production) (gỡ quyền course / blog khỏi `user`, API admin đòi thêm `admin.read`), role `super_admin` + cột `rank` + trigger, permission mới (3.3), CLI `admin:role`, guard `/studio` (A3), cờ `ADMIN_ENABLED` và header cho `/admin*` (2.1), cập nhật `docs/environments.md`, `lib/adminPermissions.js`, test tĩnh + ma trận (3.6); shell sidebar + route con, chuyển 5 tab sang route, entry `"/admin/:path*"` | quyền, `roles.rank`, trigger |
| P0b | **Trước khi sync app Inngest:** ~~đổi nhịp cron~~ (xong trong code), hạ compute Neon về 0.25–1 CU, deploy, rồi mới sync (2.2). Sau đó: Preview trỏ vào `staging`, tắt branch tự động; script `db:anonymize`; reset + ẩn danh `staging`; `APP_ENV=staging`; dọn branch cũ (2.3) | không |
| P1 | Dashboard + Users (danh sách, chi tiết, role, block / suspend / activate, thu hồi phiên, timeline) | `users.status_reason`, `status_until` |
| P2 | Runs (danh sách, chi tiết, huỷ) + Challenges (gộp Content KPIs) + attempts | không |
| P3 | System (health, hàng đợi, outbox, dead letter có resolve / retry, DB); schema `metrics` + role `grafana_ro` ở cả hai môi trường; profile `monitoring` (grafana, prometheus, blackbox-exporter) cho local; Grafana Cloud Free cho production với G1, G2 (thêm `/api/health?probe=live`, chu kỳ theo 6.4), dashboard 6.5, cảnh báo 6.6, `grafana:push`; link "Open in Grafana" | `metrics` |
| P4 | Course detail (module / lesson / challenge, checklist publish), Catalog, Enrollments | không |
| P5 | Settings dạng thẻ, Audit kiểu Logs, ⌘K command menu | không |
| P6 | G3: `@vercel/otel`, OTLP tới Grafana Cloud; dashboard Requests; cảnh báo 5xx; xác nhận lại danh tính cho việc nhạy cảm và `ADMIN_IP_ALLOWLIST` (2.1); SLO | không |
| Tuỳ chọn (học) | Admin Payments và webhook lỗi với `mock`; provider `sepay` chế độ thử ở local / staging (mục 07) | không |
| Hoãn | Instructor sở hữu course, hàng chờ duyệt, sửa ma trận quyền, feature flag, latency từng API | |

Mỗi pha: test service cho quy tắc nghiệp vụ (bậc role, tự gỡ, super admin cuối cùng, suspend hết hạn, huỷ run không ghi đè kết quả), ma trận route × role (3.6) cập nhật cho route mới, và các bước kiểm UI ở 5.7.

## 8. Rủi ro

- **A1 đang mở trên production** (đã xác nhận 2026-11-01): học viên sửa được metadata course qua API. Vá ở P0 trước mọi việc khác.
- **Lộ dữ liệu cá nhân:** email, IP, source code người học. Che PII khi thiếu `user.pii`, chỉ trả trường cần thiết, ghi audit khi xem source, không đưa email vào URL (lọc bằng body / query đã mã hoá phía server, không log query string).
- **Khoá nhầm admin hoặc mất quyền quản trị:** quy tắc bậc và "còn một super admin" ở 3.5 kiểm trong transaction; CLI `admin:role` là đường cứu khi mất hết.
- **Super admin có mọi quyền:** giữ 1–2 người, mọi hành động vẫn ghi audit, không dùng tài khoản super admin cho việc hằng ngày.
- **Admin mở trên internet ở production:** gia cố ở 2.1 (A1 vá trước, header, xác nhận lại danh tính, cờ tắt khẩn cấp, tuỳ chọn allowlist IP) và test quyền ở 3.6 chạy trong CI.
- **Thao tác nhầm trên production** khi mở cả hai môi trường cùng lúc: chip "Production", dải cảnh báo và tiền tố tiêu đề tab (2.1) là bắt buộc.
- **Hết hạn mức Neon Free làm sập cả trang học:** compute đang cố định 1 CU. Nhịp cron đã giảm về mỗi giờ (2.2) nhưng phải deploy trước khi sync app Inngest; hạ compute về 0.25–1 CU để còn chỗ cho lưu lượng người học. Monitoring theo chu kỳ ở 6.4 để không làm nặng thêm.
- **Dữ liệu cá nhân trong bản preview:** tích hợp Neon đang sao chép đầy đủ production cho mỗi preview (`preview/develop` hôm nay); staging dùng chung và ẩn danh, dọn branch cũ (2.3).
- **Tài khoản Grafana lệch với RBAC:** rà mỗi tháng, gỡ cùng lúc với gỡ role (6.7).
- **Grafana đọc DB production:** chỉ qua view gộp trong `metrics`, role `grafana_ro` chỉ đọc, `statement_timeout` 5 s, tối đa 3 kết nối; không view nào chứa email, username, IP hay source code.
- **Query nặng trên bảng lớn:** dashboard dùng cache 60 giây; danh sách dùng keyset; truy vấn `pg_stat_*` chỉ chạy khi mở trang System.
- **Access token còn sống sau khi block:** chấp nhận tới hết TTL; nếu cần tức thì, kiểm thêm trạng thái trong `getAuthSession` qua cache Redis (đã có cơ chế `status: "inactive"` cho session ở `services/auth.service.js:50`).

## 9. Câu hỏi mở

1. Có cần instructor là người dùng thật (đăng nhập, soạn và gửi duyệt course của mình) không? Nếu có, P4 thêm `catalog.course_instructor` và trạng thái `in_review`.
2. Course manager có được xem source code người học (`submission.read`) không, hay chỉ admin?
3. Ai là super admin đầu tiên trên production, và có cần người thứ hai làm dự phòng không?
