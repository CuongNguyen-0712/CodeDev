# Kế hoạch cải thiện hiệu suất API, service và SQL

Ngày rà soát: 2026-10-31. Phạm vi: `app/api/**`, `services/*`, `db/*.db.js`, `db/functions`, `db/schema.sql` + `db/migrations`, data layer phía client (`queries/`, `mutations/`, realtime).

Chưa làm: `EXPLAIN ANALYZE` trên dữ liệu thật, `pg_stat_user_indexes`, `pg_stat_statements`. Mức tác động bên dưới là ước lượng từ code; Phase 0 đo lại trước khi sửa.

## 1. Đánh giá chung

**Đã tốt**

- Layering rõ: route → service → `db/*.db.js` → SQL function.
- Session check: 1 lần đọc Redis, chỉ xuống DB khi miss. Redis load dedupe in-flight. Cache user theo version key.
- Hàng đợi: `claimOutbox` dùng `FOR UPDATE SKIP LOCKED` + lease. Admission code run theo capacity. Unique partial index "1 run active / user" đúng.
- `post_exp` / `post_points` chỉ khoá row `profile.info` của user đó. Idempotency lookup đi qua unique index. `has_course_access` là `STABLE` và dùng `uq_entitlement_active`.

**Chưa chuẩn / chưa tối ưu**

1. Một số hot path tính lại từ đầu mỗi request: ranking, course details khi đã đăng nhập, recommendation candidates, poll code run.
2. Thiếu index cho nhiều FK và nhiều điều kiện lọc. Vài index thừa hoặc không bao giờ được dùng.
3. Các bảng tăng không giới hạn, không có retention: `refresh_tokens`, `sessions`, `code_runs` (mỗi row có `source_snapshot` tới 384 KB), `question_submissions`.
4. Route layer không đồng nhất: 37/66 route không dùng `apiRoute`. Có URL kiểu động từ (`/api/get/*`, `/api/post/*`). Envelope, mã lỗi và pagination khác nhau giữa các route.
5. Client refetch quá rộng: realtime event invalidate toàn bộ `userKeys.all`. Mở một lesson thì xoá mọi cache của user.

## 2. Phát hiện chính (đã kiểm chứng lại trên code)

| # | Vấn đề | Bằng chứng | Mức |
|---|---|---|---|
| A1 | `ranking_scores()` aggregate toàn bộ `exp_transaction` + `point_transaction` và gọi 2 lần mỗi query (`s`, `a`). `/api/ranking/me` chạy 3 board, tức 6 lần full scan. `getStanding` và `getTiers` không cache | `db/ranking.db.js:54-110`, `services/ranking.service.js:99-116` | High |
| A2 | `codeRunDb.load()` dùng `WHERE status IN (...) OR finished_at > ...`. Điều kiện OR làm partial index vô dụng, và `finished_at` không có index, nên mỗi lần admission và mỗi lần `/api/health` seq scan `code_runs` | `db/codeRun.db.js:147-160` | High |
| A3 | Mỗi lần poll code run (1,5 s) select cả `source_snapshot` (≤384 KB) + `result`, rồi chạy `expire` UPDATE và `position` COUNT. Poll đi qua server action (POST, chạy tuần tự) | `db/codeRun.db.js:4-6,46,82,134`, `services/challenge.service.js:947-959` | High |
| A4 | `refresh_tokens` tăng khoảng 96 row/user/ngày (access TTL 15 phút) và không bao giờ bị xoá. Self-FK `replaced_by_id` không có index, nên mỗi lần xoá token sẽ seq scan | `db/session.db.js:394-406`, `lib/authConfig.js:24` | High |
| A5 | Course details bỏ qua Redis khi có `userId`. Query dùng `c.*`, gọi `has_course_access` 2 lần, `json_agg` lồng nhau. Page gọi query này 2 lần (`generateMetadata` + page) | `services/course.service.js:40`, `db/course.db.js:28-90`, `app/course/[id]/page.jsx:19,41` | High |
| A6 | Mở lesson: 2 UPDATE (`last_seen`, `history`) rồi `invalidateUserCache`, nên mất cache `me`, overview, progress, list, roadmap. `learning_progress_content` cũng ghi `last_seen` ngay trên read path | `services/course.service.js:150-159`, `db/course.db.js:363-389` | High |
| A7 | Account purge, và cascade `DELETE identity.users`, seq scan các cột FK không có index: `exp_transaction.actor_id`, `point_transaction.actor_id`, `comment.user_id`, `friend.sender_id`, `entitlement.user_id`, `event.created_by`, `question_submissions.question_id/question_option_id` | `db/accountPurge.db.js:94-95` | High |
| B1 | `getComments` không lọc `is_deleted`/`is_hidden`, nên comment đã xoá vẫn trả về client (bug), và partial index `idx_comment_course_created` không được dùng. Cursor chỉ có `created_at`, nên có thể trùng hoặc sót comment | `db/course.db.js:440-487` | Medium (có bug) |
| B2 | `getPermissions` dùng `OR u.id::text = $1`. Cast trên cột chặn index, gây seq scan `users` mỗi lần login/refresh | `db/user.db.js:146` | Medium |
| B3 | `getLessonChallengeStatus`: N+1 (answer key + history cho từng quiz) và bỏ qua definition cache. `submitQuiz` load history 2 lần | `services/challenge.service.js:616,650,656-687` | Medium |
| B4 | `learning_progress_content` dựng payload cả khoá học, gồm toàn bộ ngân hàng câu hỏi quiz (`md5` + `ROW_NUMBER`), mỗi lần xem trang | `db/functions/public.learning_progress_content.sql` | Medium |
| B5 | `getRecommendationCandidates` giống nhau cho mọi user, không limit, có correlated subquery, và không cache | `db/onboarding.db.js:182+`, `services/recommendation.service.js:239` | Medium |
| B6 | Tìm kiếm `ILIKE '%x%'` / `LOWER() LIKE` không có trigram. Social search dùng OFFSET trên toàn bộ users. Search string tạo cache key mới mỗi lần nên dễ bị dùng để bypass cache | `db/admin.db.js:242`, `db/social.db.js:6-41`, `db/course.db.js:120` | Medium |
| B7 | Entitlement theo user không có index đầy đủ (chỉ có partial `status='active'`) | `db/commerce.db.js:89-102`, `db/admin.db.js:249-258` | Medium |
| B8 | Public read (`course/*`, `roadmap/*`, `ranking`, `filters`) không rate limit và không có header CDN. `/api/health` công khai, chạy aggregate + S3 check, lộ số liệu queue | `lib/rateLimit.js:153`, `app/api/health/route.js:18-48` | Medium |
| B9 | Pool `max: 10`, không có `statement_timeout`, `idle_in_transaction_session_timeout`, `connectionTimeoutMillis`. `awardChallengeRewards` giữ connection qua khoảng 8 round trip WebSocket | `lib/db.js:48-49`, `db/challenge.db.js:33-75` | Medium |
| B10 | Client: `PROGRESS_UPDATED` → `invalidateQueries(userKeys.all)`. Comments bật `refetchOnWindowFocus` dù đã có Pusher | `components/realtime/userRealtimeBridge.jsx:36,62`, `queries/course.query.js:83` | Medium |
| B11 | `register_course` dùng counter `students + 1` trên row `catalog.course`, nên các lượt ghi danh cùng khoá học xếp hàng trên một row | `db/functions/public.register_course.sql` | Low/Medium |
| C1 | Index thừa: `idx_code_runs_status` (trùng `idx_code_runs_active_deadline`), `idx_accounts_user`, `users_email_key`, `idx_sessions_expires_at`/`idx_sessions_idle_expires_at` (không có query nào dùng; cột update mỗi lần rotate nên mất HOT update) | `db/schema.sql:5426` … | Low |
| C2 | Cột `timestamp` không TZ trong `code_runs` (migration `20261030_001`) được so sánh với `now()`. `ranking_scores` dùng `created_at::timestamp` | migration `20261030_001` | Low |
| C3 | `course-details` gọi `decodeURIComponent` trên giá trị đã decode, nên id chứa `%` sẽ ném `URIError` và trả 500 | `app/api/course/course-details/route.js:21` | Low (bug) |

## Trạng thái thực hiện (2026-11-01)

Đã chạy migration trên DB local. Production chưa chạy, theo thứ tự `20261101_001` → `004`. Mỗi `CREATE INDEX` khoá ghi bảng của nó trong lúc build, nên chạy lúc ít traffic.

| Phase | Commit | Đã làm | Chưa làm / lý do |
|---|---|---|---|
| 0 | | | Chưa đo baseline: cần `pg_stat_statements` trên Neon production |
| 1 | `e03b6fb` | Migration `001`: index, throttle `last_seen`. Sửa query `codeRun`, comments, `getPermissions`, `course-details`, quiz key | |
| 2 | `0c8d950` | Migration `002`: `profile.ranking_snapshot` (materialized view, refresh concurrently ≤ 5 phút một lần khi có người đọc). Điểm của chính viewer vẫn tính live | |
| 3 | `bb29c5c` | Migration `003`: bỏ câu hỏi quiz khỏi `learning_progress_content`, thêm trigram cho search user. Cache course details (public + viewer), cache recommendation candidates. Invalidate realtime theo đúng key. Webhook Sanity | Không tách version key "My learning": `last_seen` đã throttle, phần lợi còn lại nhỏ hơn chi phí thêm 1 lần đọc Redis mỗi request |
| 4 | `75edb8b` | Migration `004`: `code_runs` sang `timestamptz`, drop index thừa. Retention hằng ngày cho sessions/tokens và code runs. Timeout và `max` của pool lấy từ env | Không gộp `post_points → award_exp → award_achievements` vào một function (mục này vốn là tuỳ chọn) |
| 5 | `d47f015`, `91b27f0` | Tách rõ API (đọc) và server action (ghi), xem [api-conventions.md](api-conventions.md). Mọi route app đi qua `apiRoute`. Keyset cho comments và `/api/users`. Xoá route chết, logout chuyển sang `POST /api/auth/logout`, tách health. Logic link tài khoản chuyển vào service. Tách `lib/challenges/quiz.js` và `grading.js` | Các list `courses`, `orders`, `experience`, `course-progress` vẫn dùng cursor cũ (ghi trong api-conventions §4). Không bỏ flow nộp code chấm trên trình duyệt (dev cần khi không có runner) |

## Rà lại mục chưa làm và rủi ro (2026-11-01)

### Mục chưa làm: kết luận sau khi rà lại

| Mục | Kết quả rà lại | Quyết định |
|---|---|---|
| Phase 0: baseline | DB local không nạp `pg_stat_statements` (`shared_preload_libraries` trống). Neon có sẵn extension, nhưng chưa có script đo | **Làm (F1):** viết `db/tools/baseline.mjs`, chỉ đọc |
| Version key riêng cho "My learning" | Mở lesson chỉ xoá cache user tối đa 1 lần/phút mỗi lesson (đã throttle) | **Bỏ**, trừ khi baseline cho thấy `/api/user/overview` miss cache nhiều |
| Gộp 3 hàm thưởng | `awardChallengeRewards` chỉ có 3 query trong 1 transaction, và chỉ chạy ở lần pass đầu của mỗi challenge | **Bỏ**: tiết kiệm 2 round trip cho một sự kiện hiếm |
| 4 list dùng cursor cũ | `courses` (`lastId`), `course-progress`, `orders` (`before` = public id), `point transactions` đều đã là keyset, không có OFFSET | **Để sau**: chỉ khác tên tham số, không ảnh hưởng hiệu suất. Đổi sang `{ items, nextCursor }` khi sửa tới màn hình đó |
| Flow nộp code chấm trên trình duyệt | Production đã bị chặn (`isProductionEnv()` → 503, `services/challenge.service.js`) | **Giữ** cho dev |

### Rủi ro và phương án

| # | Rủi ro | Phương án | Loại |
|---|---|---|---|
| R1 | **Migration khoá bảng trên production.** `CREATE INDEX` khoá ghi bảng. `ALTER COLUMN ... TYPE timestamptz` của `code_runs` lấy ACCESS EXCLUSIVE, và viết lại toàn bộ bảng nếu timezone của session migration không phải UTC (DB local đang là `America/Los_Angeles`). `CREATE MATERIALIZED VIEW` chạy aggregate toàn bộ ledger một lần | (a) Tạo Neon branch từ production, chạy `DATABASE_URL=<branch> npm run db:migrate -- --yes` để đo thời gian thật và có điểm khôi phục. (b) `migrate.mjs` đặt `lock_timeout` (mặc định 5s cho DB không phải local): migration gặp lock thì fail ngay thay vì chặn traffic. (c) Kiểm tra `SHOW timezone` trên production: là UTC thì ALTER không viết lại bảng. Nếu không phải UTC: chạy `004` lúc ít traffic. (d) Nếu baseline cho thấy bảng > ~1M row: chạy trước các `CREATE INDEX CONCURRENTLY IF NOT EXISTS` tương ứng (ngoài transaction); khi đó `IF NOT EXISTS` trong migration thành no-op | Code (b) + vận hành (a, c, d) |
| R2 | **`DB_POOL_MAX` mặc định 10 trên Vercel**: mỗi instance mở tới 10 kết nối | Mặc định 3 khi có `VERCEL`, 10 cho server chạy lâu. Biến env vẫn ghi đè được | Code |
| R3 | **Thiếu env mới.** Thiếu `HEALTH_TOKEN`: không xem được báo cáo health đầy đủ (vẫn an toàn). Thiếu `SANITY_WEBHOOK_SECRET`: webhook trả 404, cache bài học sống 1h như trước. Neon HTTP không có `statement_timeout` | `lib/envCheck.mjs` cảnh báo ở production khi thiếu `HEALTH_TOKEN` (và `CRON_SECRET`), hoặc thiếu `SANITY_WEBHOOK_SECRET`. Ghi bước cấu hình webhook Sanity (URL, filter `_type == "lesson"`, projection `{_id, _type}`, secret) vào `docs/environments.md`. Đặt `ALTER ROLE <app> SET statement_timeout = '30s'` sau khi baseline xác nhận không query hợp lệ nào vượt 30s | Code + vận hành |
| R4 | **Ranking snapshot làm mới khi có người đọc**: cứ 5 phút, request đầu tiên phải chịu aggregate toàn bộ ledger (p95 tăng vọt). Khi Redis rơi về cache bộ nhớ, mỗi instance tự làm mới riêng | Thêm Inngest cron `ranking-refresh` mỗi 5 phút (`jobs/crons.js`), nên người đọc hầu như không còn kích hoạt làm mới. Cơ chế làm mới khi đọc giữ làm dự phòng khi không có Inngest; advisory lock vẫn bảo đảm chỉ 1 lần chạy | Code |
| R5 | **Dev server cổng 3000 giữ module cũ**: `/api/users` 500, trang Contacts chưa kiểm tra được trên UI | Restart `npm run dev` (vẫn lỗi thì xoá `.next/dev`). Sau đó kiểm tra Contacts: tìm kiếm, cuộn tải thêm, badge rank | Vận hành + kiểm tra |
| R6 | **Tab cũ trong lúc deploy** còn gọi server action đã xoá (`getQuizStateAction`, …) hoặc `PATCH /api/user/logout` | Chấp nhận: đây là hành vi chuẩn của Next khi deploy, reload là hết. Không giữ alias, tránh mã chết | Không làm |
| R7 | **Monitor đọc body cũ của `/api/health`** (`database`, `jobs`) | Docker healthcheck chỉ xem status code, không bị ảnh hưởng. Monitor ngoài nào cần chi tiết thì thêm header `Authorization: Bearer $HEALTH_TOKEN` | Vận hành |

### Thứ tự triển khai

1. Code: R2, R3 (envCheck + docs), R4, R1(b), F1. Một commit, kèm test.
2. Production, trước deploy: tạo `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`, chạy `node db/tools/baseline.mjs --env .env.production` (baseline "trước").
3. Tạo Neon branch từ production, chạy migration trên branch, ghi lại thời gian từng file (R1a). Kiểm tra `SHOW timezone` (R1c).
4. Đặt env: `HEALTH_TOKEN`, `SANITY_WEBHOOK_SECRET`, `DB_POOL_MAX` (nếu muốn khác mặc định). Tạo webhook trong Sanity.
5. Lúc ít traffic: `npm run db:migrate:prod`, rồi deploy app.
6. Sau 24h: chạy lại baseline, so `mean_exec_time` / `calls` của top query. Đặt `statement_timeout` cho role (R3).

## 3. Kế hoạch theo phase

Thứ tự ưu tiên: đo → quick win không đổi hành vi → hot path → retention → chuẩn hoá API. Mỗi phase là một PR riêng, chạy `npm test` và `npm run db:compare` trước khi merge.

### Phase 0: Đo baseline (0,5 ngày)

- Bật `pg_stat_statements` trên Neon, lấy top 20 query theo `total_exec_time` và `calls`.
- `EXPLAIN (ANALYZE, BUFFERS)` cho: `ranking_scores`, `getStanding`, `codeRunDb.load`, `getComments`, `getDetails`, `learning_progress_content`, `getRecommendationCandidates`.
- Lấy `pg_stat_user_indexes` (`idx_scan = 0`) để xác nhận index thừa trước khi drop.
- Ghi p50/p95 cho `/api/ranking/me`, `/api/course/course-details`, poll code run, mở lesson. Đây là mốc so sánh cho các phase sau.

### Phase 1: Index + sửa query nhỏ (1–2 ngày, rủi ro thấp)

**Trạng thái (2026-11-01):** đã làm, migration `20261101_001_perf_indexes.sql` đã chạy trên local. `EXPLAIN` local xác nhận các query dùng index mới. Ba mục còn lại:

- Chưa làm: cursor comment `(created_at, id)`, vì phải đổi contract với client (`lastCreated`). Chuyển sang Phase 5 (pagination chung).
- Chưa làm: bump riêng version key cho "My learning". Thay vào đó, ghi `last_seen` được throttle 1 phút/row, nên số lần invalidate đã giảm. Phần tách version key chuyển sang Phase 3.
- Giữ nguyên: `submitQuiz` load history lần 2. Lần load này cần thiết để trả về state có cả attempt vừa nộp.

Một migration `db/migrations/20261101_001_perf_indexes.sql`:

```sql
-- code_runs
CREATE INDEX IF NOT EXISTS idx_code_runs_done_recent ON challenge.code_runs (finished_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_code_runs_queued ON challenge.code_runs (queued_at) WHERE status = 'queued';
DROP INDEX IF EXISTS challenge.idx_code_runs_status;

-- auth
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by ON identity.refresh_tokens (replaced_by_id) WHERE replaced_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON identity.refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_outbox_processed ON identity.auth_outbox (processed_at) WHERE processed_at IS NOT NULL;

-- FK phục vụ purge / cascade
CREATE INDEX IF NOT EXISTS idx_exp_tx_actor ON profile.exp_transaction (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_tx_actor ON profile.point_transaction (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comment_user ON community.comment (user_id);
CREATE INDEX IF NOT EXISTS idx_friend_sender ON community.friend (sender_id);
CREATE INDEX IF NOT EXISTS idx_event_created_by ON community.event (created_by);
CREATE INDEX IF NOT EXISTS idx_entitlement_user ON commerce.entitlement (user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsub_question ON challenge.question_submissions (question_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_qsub_option ON challenge.question_submissions (question_option_id);

-- ranking theo kỳ (30 ngày)
CREATE INDEX IF NOT EXISTS idx_exp_tx_created ON profile.exp_transaction (created_at) INCLUDE (user_id, amount);
```

Lưu ý: `db/tools/migrate.mjs` bọc mỗi migration trong `BEGIN/COMMIT`, nên không dùng được `CREATE INDEX CONCURRENTLY`. Các bảng hiện còn nhỏ nên dùng `CREATE INDEX` thường. Khi bảng lớn (>1M row), cần thêm chế độ "no-transaction" cho runner.

Sửa code đi kèm:

- `codeRunDb.load()`: tách thành 2 query, mỗi query trúng một index (active/oldest qua partial index; `since_last_done`/`avg_job` qua `idx_code_runs_done_recent`).
- `codeRunDb.get()`: thêm bản select gọn cho poll, không lấy `source_snapshot`. Kiểm tra `deadline_at` trong JS trước khi gọi `expire`.
- `getComments`: thêm `AND m.is_deleted = false AND m.is_hidden = false`. Đổi cursor sang `(created_at, id)`.
- `getPermissions`: `WHERE u.public_id = $1`. Kiểm tra trước là mọi caller đều truyền `public_id`.
- `touchLesson` và `learning_progress_content`: thêm `AND last_seen < now() - interval '5 minutes'`. Chỉ bump version key của list "My learning", không gọi `invalidateUserCache` toàn bộ.
- `course-details`: bỏ `decodeURIComponent`, validate bằng `PUBLIC_ID` như route `courses`.
- `getLessonChallengeStatus`: batch bằng `challenge_id = ANY($1::bigint[])` và dùng `loadQuizKey` (có cache). `submitQuiz` chỉ load history một lần.

Kỳ vọng: poll code run nhẹ hơn hàng chục đến hàng trăm KB mỗi lần. Admission và health không còn seq scan. Login/refresh không seq scan `users`. Purge account không còn quadratic.

### Phase 2: Ranking (2–3 ngày)

- Tạo bảng `profile.ranking_score (board, period, user_id, score, last_at)`. Inngest cron làm mới bảng mỗi 5 phút, chạy set-based, ghi vào bảng tạm rồi swap. Đọc vào trang nào cũng chỉ là index lookup.
  - Cách thay thế, ít code hơn: với `period = all`, đọc thẳng `profile.info.exp` / `points` (đã là cache của ledger). Chỉ board 30 ngày dùng `ranking_scores($since)`, và chỉ tính một lần, không tính `s` + `a` như hiện tại.
- Cache `getStanding` theo `(board, period, user)` 60 s. Cache `getTiers` 10 phút.
- `/api/ranking/me`: gom 3 board vào một query.
- Lâu dài: lưu `first_try` / `attempts` vào metadata của ledger, bỏ correlated count trên `question_submissions` / `code_submissions`.

### Phase 3: Cache và hot path đọc (2–3 ngày)

- **Course details**: luôn đọc phần public từ `cacheKeys.courseDetailsPublic`. Chạy song song một query nhỏ theo user (status, progress, owned, favorite) rồi merge. Bỏ `c.*`. Bọc loader bằng React `cache()` để `generateMetadata` và page chỉ chạy một lần.
- **Recommendation**: cache candidate list 10 phút; chỉ phần xếp hạng theo user chạy live.
- **`learning_progress_content`**: trả skeleton (lesson + trạng thái). Câu hỏi quiz load theo lesson khi mở.
- **Public read**: chuyển sang `apiRoute({ auth: false, limiter: rateLimiters.api })`. Thêm `Cache-Control: public, s-maxage=600, stale-while-revalidate` cho `filters`, `roadmap/list` (giống `onboarding/catalog`).
- **Search**: `CREATE EXTENSION pg_trgm`, GIN index trên `lower(username)`, `lower(email)`, `course.title`. Social search đổi OFFSET sang keyset `(username, id)`.
- **Invalidation**: thêm catalog version key, bump khi admin publish/sửa course. Thêm Sanity webhook để xoá cache lesson content (đang TTL 1 h).
- **Client**: `userRealtimeBridge` chỉ invalidate các key bị ảnh hưởng. Bỏ `refetchOnWindowFocus` ở comments. Poll code run: ưu tiên push qua `publishToUser` (đã có); poll chỉ là fallback, ≥5 s, có jitter, và abort khi unmount.

### Phase 4: Retention và kết nối DB (1–2 ngày)

Thêm các step vào cron hằng ngày (`jobs/crons.js`). Mỗi step xoá theo batch `LIMIT 5000` trong vòng lặp:

- `refresh_tokens` > 30 ngày, thuộc session đã revoke/hết hạn.
- `sessions` có `absolute_expires_at < now() - interval '30 days'`.
- `code_runs`: set `source_snapshot = NULL` sau 14 ngày; xoá row con của manual run sau 30 ngày.

Cấu hình DB:

- Dùng host Neon `-pooler`. Trên Vercel đặt `max` nhỏ (2–3).
- Đặt `statement_timeout ≈ 15s`, `idle_in_transaction_session_timeout ≈ 10s`, `connectionTimeoutMillis`.
- Gộp chuỗi `post_points → award_exp → award_achievements` vào một plpgsql function, để transaction thưởng chỉ tốn 1 round trip.

Dọn index thừa: drop `idx_accounts_user`, `users_email_key`, `idx_sessions_expires_at`, `idx_sessions_idle_expires_at`. Chỉ drop sau khi Phase 0 xác nhận `idx_scan = 0`.

Kiểu dữ liệu: đổi các cột thời gian của `code_runs` sang `timestamptz`. `ranking_scores` bỏ cast `::timestamp`.

### Phase 5: Chuẩn hoá API và service (3–5 ngày, làm dần)

- **Route**: mọi route dùng `apiRoute`, cùng envelope `{ success, data }` / `{ success: false, error: { code, message } }`. Body lỗi 429 cũng có `code`.
- Xoá route chết: `get/getMyFriends`, `get/getSocial`, `post/postCreateTeam` (không có caller). Đổi `get/getUsersSocial` thành `GET /api/users?search=&cursor=`. Đổi `PATCH /api/user/logout` thành `POST /api/auth/logout`.
- **Pagination**: một contract chung, `?cursor=&limit≤50` trả `{ items, nextCursor }`, cursor là keyset dạng opaque.
- **Validation**: mọi input đi qua `lib/validation`. Hiện chỉ 12 route dùng.
- **Đọc qua server action**: chuyển `getCodingWorkspace`, `getQuizState`, `getCodeRun`, `getCodingHistory`, `getSubmissionCode` sang route `GET /api/challenges/:id/...`, vì server action là POST, chạy tuần tự và không cache được.
- **`/api/health`**: tách thành liveness (`SELECT 1`, công khai) và readiness (queue, DLQ, S3, cần token).
- **Service**: tách `challenge.service.js` (1185 dòng) thành `quiz.service`, `coding.service`, `codeRun.service` (phía job) và `challengeAccess`. Bỏ flow submit 2 bước chấm trên trình duyệt nếu runner luôn được cấu hình. Chuyển logic link account từ `app/api/auth/[...nextauth]/route.js` vào `accountLink.service`.

## 4. Cách kiểm chứng

- Mỗi phase so sánh p95 và `pg_stat_statements` (`mean_exec_time`, `calls`) với baseline Phase 0.
- Test hiện có (`npm test`) phải pass. Thêm test cho: comment không trả bản đã xoá, cursor `(created_at, id)` không sót, ranking từ bảng mới khớp `ranking_scores()` trên dữ liệu seed.
- `npm run db:compare` sau migration để bắt drift giữa local và production.

## 5. Ngoài phạm vi / chưa xem

- Body của admin/commerce service, các Inngest job ngoài call site, kích thước payload Sanity thật.
- Các function `sign_up`, `create_session`, `redeem_course_points`, `create_money_order` chưa đọc kỹ.
- `log_in` lấy role bằng `LEFT JOIN user_roles ... LIMIT 1`, nên user nhiều role nhận role tuỳ ý. Đây là bug đúng/sai, không phải hiệu suất, nên tách ticket riêng.
