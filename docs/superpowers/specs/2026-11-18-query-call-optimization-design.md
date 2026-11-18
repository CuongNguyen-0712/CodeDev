# Rà soát query, dữ liệu trả về và số lần gọi — thiết kế

Date: 2026-11-18. Status: chờ duyệt. Tiếp theo của `docs/performance-plan.md` (5 phase đã xong) và `2026-11-14-load-capacity-improvements-design.md`.

## 1. Mục đích

Chủ dự án yêu cầu rà **toàn bộ** codebase theo ba hướng: (1) kiểm tra và viết lại câu query chưa tốt, (2) cắt dữ liệu thừa ở mỗi câu query / mỗi response, (3) giảm số lần gọi (request từ trình duyệt và round trip tới DB). Lý do cụ thể chủ dự án chưa nêu; phạm vi đã chốt là "tất cả".

*(Quyết định của người viết spec)* Vì không có một lý do ưu tiên, đợt này đo và giảm cả ba thứ: độ trễ người dùng thấy (chuỗi request chờ nhau khi tải trang), chi phí chạy nền (request và lệnh Redis một tab để yên vẫn bắn), và tải DB (round trip mỗi thao tác). Khi hai thứ xung đột, ưu tiên theo đúng thứ tự đó.

## 2. Hiện trạng (đọc từ code ngày 2026-11-18, chưa đo)

**Thời gian chạy SQL không còn là nút thắt.** Lần stress 200 VU trên Vercel + Neon: DB nhàn (câu standing 6–10 ms, `learning_progress` ~9,5 ms); p95 ~900 ms là mạng + SSR (`docs/loadtest/2026-11-14-stress-analysis.md`).

**Số lần gọi là chỗ tốn.**

- Trên Neon, mỗi `sql()` là một lượt HTTP riêng (`lib/db.js:95-111`); transaction đi qua pool WebSocket, `BEGIN` và `COMMIT` mỗi cái một round trip.
- Mỗi trang đã đăng nhập bắn 6–13 request. Phần cố định mỗi trang: `/api/auth/session`, `/ranking/me`, `/api/pusher/auth`, `/user/me`, `/user/notifications`, `/chat/unread`.
- `SessionProvider` không có session ban đầu và poll mỗi 60 s mỗi tab (`contexts/providers.jsx:30-33`); mọi query `enabled: status === 'authenticated'` chờ lượt này.
- Đường ghi dài: `submitQuiz` 8–11 round trip, chat `send` 11–19, `finalizeCodeRun` ~23, `toggleReaction` ~11.

**Không có công cụ đếm.** `lib/db.js` không ghi thời gian hay số query mỗi request; không test nào đếm câu SQL. Hiện không kiểm chứng được "đã giảm".

**`db/schema.sql` đã cũ** (baseline 2026-10-23, thiếu bảng blog/chat/ranking_snapshot, còn liệt kê index đã drop). Bộ index thật = `schema.sql` + `db/migrations/*.sql`.

Phát hiện chi tiết theo luồng nằm ở §5.4.

## 3. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Mọi hàm export trong `db/*.db.js` + `db/roadmap.js`, mọi SQL function trong `db/functions/`, mọi route `app/api/**/route.js`, mọi action trong `actions/`, mọi query/mutation trong `queries/`, `mutations/` và query viết inline trong component đều có một dòng trong bảng rà soát (§5.2), với kết luận "ổn" hoặc "sửa ở luồng X" kèm lý do.
- Mỗi luồng (§5.4) có số trước/sau: số request trình duyệt khi tải trang lần đầu, và số round trip DB của mỗi thao tác chính. Không luồng nào tệ hơn trước.
- Round trip DB của các thao tác đã sửa được khoá bằng test (§5.1), để lần sau thêm query thì test báo.
- Hành vi sản phẩm không đổi, trừ các lỗi nêu rõ ở §5.4 (đánh dấu **lỗi**).

**Không làm**

- Đổi driver DB, đổi ORM, thêm dependency.
- Đổi kiến trúc phiên đăng nhập (next-auth, JWT, Redis session).
- Bỏ `loadActor` đọc DB mỗi lần gọi admin API (`lib/authz.js:15-18`): đây là lựa chọn bảo mật có chủ ý.
- Đổi giao diện. Nếu một sửa đổi buộc phải đổi thứ người dùng nhìn thấy, dừng lại và chạy quy trình `ui-consistency` cho phần đó.
- Deploy production, chạy migration trên production.

**Phản mục tiêu** (đạt số vẫn là hỏng)

- Cache làm người dùng thấy dữ liệu cũ sau thao tác của chính họ (điểm, tiến độ, tin nhắn, lượt thích).
- Giảm request bằng cách bỏ tính năng, bỏ realtime, hoặc tăng `staleTime` cho dữ liệu cá nhân mà không có cơ chế cập nhật thay thế.
- Gộp nhiều query thành một câu khổng lồ khó đọc hơn mà không giảm round trip đo được.
- Làm một route đang prerender (Cache Components) thành dynamic để truyền dữ liệu theo người dùng (`docs/state-management.md` §4).
- Nới hoặc bỏ validate, rate limit, kiểm tra quyền, xử lý lỗi khi gộp/di chuyển code.

## 4. Các cách đã cân nhắc

| Cách | Đánh đổi |
|---|---|
| A. Chỉ sửa danh sách nóng đã biết | Nhanh nhất, diff nhỏ. Không phải "tất cả": admin, commerce, bên trong các SQL function lớn vẫn chưa rà. |
| B. Quét theo lớp (từng file `db`, rồi service, route, hook) | Phủ kín, dễ theo dõi. Không thấy lượt gọi thừa nằm *giữa* các lớp (server tải rồi client tải lại; hai endpoint trả cùng dữ liệu). Tốn công cho câu hiếm chạy. |
| **C. Theo luồng người dùng + bảng rà soát phủ kín (chủ dự án chọn)** | Mỗi luồng lần từ component → API → service → SQL, sửa cả ba hướng một lượt, có ngân sách đo được. Lâu hơn A, phải dựng công cụ đo trước. |

## 5. Thiết kế

### 5.1 Bước 0: công cụ đo

*(Quyết định của người viết spec)*

- **Bộ đếm round trip DB theo request**, trong `lib/db.js`, dùng `AsyncLocalStorage` (`node:async_hooks`, không thêm dependency). Đếm mọi câu đi qua `sql()` và qua client lấy từ `dbPool.connect()` / `dbPool.query()`; `BEGIN`, `COMMIT`, `ROLLBACK` cũng tính. Ghi số câu và tổng thời gian.
- `apiRoute` (`lib/routeHandler.js`) và `runAction` (`lib/serverAction.js`) mở một phạm vi đếm cho mỗi request. Ngoài production: ghi một dòng log khi request vượt ngưỡng (env, mặc định 10 câu). Production: tắt, trừ khi bật bằng env.
- Bộ đếm cũng đếm lệnh Redis đi qua `lib/cache.js` (số riêng, không cộng vào round trip DB): trên Upstash mỗi lệnh cũng là một lượt HTTP.
- **Helper cho test**: chạy một hàm service trong phạm vi đếm và trả về số round trip, dùng trong test integration hiện có (`__tests__/**/**.integration.test.js`) để khoá ngân sách.
- **Ngân sách round trip tính cho cache lạnh, đường thành công** (trường hợp xấu nhất không lỗi). Test chạy với cache bộ nhớ (`vitest.config.mjs:43-44`), nên helper xoá cache trước khi đếm để số ổn định. Thêm cache **không** được tính là đạt ngân sách, trừ khi dữ liệu giống nhau với mọi người dùng hoặc được xoá khi chính người đó ghi (cơ chế `invalidateUserCache` / version key hiện có).
- **Request trình duyệt**: đo tay bằng trình duyệt (tải cứng, đã đăng nhập, đếm request tới `/api/*` và server action cho tới khi trang yên), ghi vào bảng rà soát. Không viết test tự động cho phần này.
- **Request khi tab để yên**: đếm request một tab đã đăng nhập, không thao tác, bắn trong 10 phút (poll session, poll unread, poll admin). Đây là phần ngân sách tải trang không thấy.
- Bộ index thật đọc từ DB local đang chạy (`pg_indexes`), không đọc từ `db/schema.sql`. `npm run db:export` chỉ ghi `db/functions`, `views`, `triggers`, `schema.dbml`; `schema.sql` là baseline squash, chỉ được squash lại khi mọi migration đã lên production (`db/README.md:138-141`), nên **không đụng** trong đợt này.

### 5.2 Bảng rà soát

File `docs/query-audit.md`, commit, cập nhật ở mỗi luồng. Ba bảng:

1. **DB**: mỗi hàm `db` và mỗi SQL function một dòng: file:dòng, luồng gọi nó, kết luận theo checklist §5.3, hành động.
2. **API/action**: mỗi route và action một dòng: số round trip (đo bằng §5.1), response có trường nào không ai đọc, hành động.
3. **Client**: mỗi query/mutation một dòng: key, endpoint, preset thời gian, số nơi gọi, hành động. Kèm bảng "request mỗi trang" trước/sau.

Bảng được lập khung (liệt kê đủ dòng, cột kết luận để trống) ở bước 0, rồi điền dần. Dòng không thuộc luồng nào được xử lý ở luồng cuối (L8).

### 5.3 Checklist cho mỗi dòng

**Câu query**

- Chỉ chọn cột caller thật sự đọc; không `SELECT *`, `t.*`, `RETURNING *` (trừ `SELECT * FROM fn()` khi function đã trả đúng cột cần).
- Không đọc cột lớn để suy ra giá trị nhỏ (ví dụ `body_md` để tính phút đọc).
- List có `LIMIT`, phân trang keyset theo `docs/api-conventions.md` §4.
- Điều kiện `WHERE` / `ORDER BY` của list nóng có index dùng được; kiểm bằng `EXPLAIN (ANALYZE, BUFFERS)` trên DB local đã seed load test (5 000 user). Không thêm index khi `EXPLAIN` không cho thấy lợi.
- Subquery tương quan chạy theo từng dòng của list: chuyển sang join/aggregate một lần nếu `EXPLAIN` cho thấy nó chiếm phần lớn chi phí.

**Số round trip (server)**

- Không await query trong vòng lặp theo phần tử: dùng `= ANY($1)`, `INSERT ... SELECT unnest(...)`, hoặc một câu nhiều dòng.
- Không đọc cùng một dòng hai lần trong một request (ví dụ tra `public_id → id` lặp lại, `getQuizAttempts` hai lần).
- Các câu đọc độc lập trong một request chạy song song; các câu trong một transaction gộp bằng CTE khi không làm khó đọc.
- Hàm đọc theo request được gọi nhiều lần trong một lần render (session, loader trang) bọc bằng React `cache()`.

**Số request (client)**

- Server đã tải dữ liệu để render thì đưa vào cache của React Query, client không tải lại ngay khi mount.
- Cùng một dữ liệu chỉ có một key và một endpoint.
- Mutation đưa kết quả trả về vào cache bằng `setQueryData` (`docs/api-conventions.md` §3); chỉ invalidate đúng key bị ảnh hưởng, không invalidate theo prefix `*.all`.
- Sự kiện realtime vá cache hoặc invalidate đúng key; không vừa `setQueryData` vừa invalidate cùng key.
- Không poll khi đã có push; poll còn lại có lý do ghi trong code.
- `refetchOnWindowFocus` không bật cho `useInfiniteQuery` đã có realtime (focus tải lại mọi trang đã load).
- Component chỉ cần số đếm thì gọi endpoint trả số đếm, không tải cả list.

### 5.4 Các luồng

Thứ tự theo số người dùng bị ảnh hưởng. Ngân sách là *(quyết định của người viết spec)*, đặt từ số đọc code; nếu số đo ở đầu luồng khác xa thì chỉnh ngân sách và ghi lý do vào bảng rà soát.

**L0 — Khung chung mọi trang** (`contexts/providers.jsx`, navbar, realtime bridge, `lib/session.js`)

- Chuông thông báo tải 20 mục trên mọi trang và mỗi lần focus, chỉ để lấy `unreadCount` (`components/ui/notificationCenter.jsx:112`, `queries/user.query.js:66`).
- `RankUpWatcher` gọi `/ranking/me` trên mọi trang đã đăng nhập, cả admin (`components/ui/level.jsx:219-240`); mỗi lần là 3 board × 2 câu.
- Session: không có giá trị ban đầu, poll 60 s (~1 440 request mỗi tab mỗi ngày, mỗi lượt một lần đọc Redis). Refresh token không phụ thuộc poll này (hẹn giờ theo `accessExpiresAt`) và mọi API call đều kiểm phiên ở server. Poll chỉ là đường dự phòng đưa `session.error = REVOKED` tới tab khi sự kiện Pusher `session-revoked` không tới (`app/api/auth/[...nextauth]/route.js:327-333`, `components/auth/sessionWatcher.jsx:73-76`). **Chủ dự án quyết (2026-11-18):** poll mỗi 5 phút (`refetchInterval={300}`), giữ `refetchOnWindowFocus`. Chấp nhận: tab để yên có thể hiện giao diện đã đăng nhập thêm tối đa 5 phút sau khi phiên bị thu hồi mà Pusher không báo; quay lại tab thì kiểm ngay.
- Pusher reconnect invalidate 4 prefix `user`, `chat`, `friends`, `teams` (`components/realtime/userRealtimeBridge.jsx:48-53`).
- `getAuthSession` không bọc `cache()`: mỗi lần gọi trong cùng một render là một lượt đọc Redis (`lib/session.js:69-101`).
- Ngân sách: request cố định mỗi trang đã đăng nhập 6 → ≤ 4. Toast lên hạng và badge chưa đọc vẫn hoạt động như cũ.

**L1 — Học bài và nộp bài** (`/learning/[id]`, challenge, code run)

- Tải trang là chuỗi 4 tầng: session → `learning-progress` → `/course/learning` → mỗi challenge 1–2 GET (`components/learning/[id]/studyingPage.jsx:309`, `lessons.jsx:143`).
- Mở bài: `learning_lesson()` không cache và có ghi; `touchLesson` thêm 2 UPDATE; `recordLessonVisitAction` bump version key làm rớt mọi cache theo user (`services/course.service.js:198-207`).
- Nộp bài: `learning-progress` bị tải 2–3 lần (mutation invalidate + `refetch()` ở `studyingPage.jsx:577` + echo `PROGRESS_UPDATED`); `me` 2 lần.
- `submitQuiz` 8–11 round trip, `getQuizAttempts` gọi 2 lần (`services/challenge.service.js:411,443`); `postSubmitLesson` 5 + N + n; `notifyRewards` INSERT từng dòng (`services/notification.service.js:99-116`); `finalizeCodeRun` ~23.
- Poll code run mỗi 1,5 s rồi 3 s, tối đa 6 phút (`mutations/challenge.mutation.js:13-35`), 1–2 câu mỗi lần.
- `CHALLENGE_SUBMITTED` invalidate `learningProgress` của mọi khoá.
- Ngân sách: tải trang ≤ 3 tầng; nộp bài tải `learning-progress` đúng 1 lần; `submitQuiz` ≤ 6 round trip; `notifyRewards` 1 câu bất kể số phần thưởng.

**L2 — Khoá học** (`/course`, `/course/[id]`)

- `/course/[id]`: dấu thời gian hydrate là lúc build cache (`lib/hydrate.js:10-23`), preset `catalog` stale sau 30 s, nên gần như mọi lượt xem tải lại cả khoá học. Trạng thái người xem được tính hai lần: gộp trong `course-details` (`services/course.service.js:69-74`) và riêng ở `/course/viewer-state`.
- `getCourseDetails` dùng `c.*` + 5 subquery JSON (`db/course.db.js:52-103`); `RETURNING *` ở `:475,552,595`.
- `/course` với người đã onboarding: list server prefetch bị bỏ, client chờ session → onboarding status → tải list lần hai (`components/course/coursePage.jsx:82-104`).
- `getCourseList`: subquery `estimated_exp` và offer theo từng dòng (`db/course.db.js:251-264`); tìm `ILIKE '%…%'` không có trigram (`:145-148`); sắp theo rating/lessons không có index.
- Ngân sách: `/course/[id]` đã đăng nhập ~6 → ≤ 4 request, không tải lại phần public của khoá học.

**L3 — Chat** (`/messages`, `/messages/[id]`)

- `send` 11–19 round trip, `toggleReaction` ~11 (`messageRef` 2 lần), `markRead` 6 (`services/chat.service.js:220-275,387-466`).
- `/messages/[id]`: server tải conversation để kiểm 404 rồi client tải lại (`app/(shell)/messages/[id]/page.jsx:14-38`, `conversationView.jsx:183`); messages chỉ tải sau conversation.
- `getConversation` 4 câu tuần tự (`services/chat.service.js:327-338`).
- Inbox sắp theo `COALESCE(last_message_at, created_at)` không có index.
- Ngân sách: `send` ≤ 8, `toggleReaction` ≤ 6, `markRead` ≤ 3 round trip; `/messages/[id]` không tải conversation hai lần.

**L4 — Home, profile, ranking, learning list, roadmap, thông báo, cài đặt**

- `/home`: kiểm onboarding ở server rồi client gọi lại `/onboarding/status` chỉ để chọn link.
- `/learning`: tải cả `/user/overview` chỉ để đọc `.length`; **lỗi**: số đếm sai khi một nhóm có hơn 10 khoá (SQL cắt 10, `db/user.db.js:251-268`); `summary.by_status` trong cùng payload có số đúng.
- Profile công khai: 8 câu, 6 lần tính `ranking_scores()` không cache (`services/profile.service.js:22-53`).
- `/user/me`: truy vấn số dư điểm live mỗi lần gọi (`services/user.service.js:72`).
- `/user/experience`: gửi lại bảng `levels` ở mọi trang lịch sử.
- Roadmap chi tiết: người đã đăng nhập tải lại cả roadmap dù SSR đã có.
- Thông báo: tab chưa đọc tải 2 list. Recommendations dưới 2 key (limit 3 và 6).
- `courseProgress`, `notifications` (infinite) bật `refetchOnWindowFocus`.
- Ngân sách: profile công khai ≤ 4 câu; không trang nào tải lại dữ liệu server đã render.

**L5 — Blog**

- `listPublished` đọc cả `body_md` của 13 dòng để tính phút đọc và ảnh bìa (`db/blog.db.js:71`); `/api/blog/posts` không cache.
- Like: 7–8 round trip; `setLike` invalidate mọi trang `feedState` (`mutations/blog.mutation.js:28-31`).
- Viewer/feed state 2 câu tuần tự; `listMine` không `LIMIT`.

**L6 — Onboarding và thanh toán**

- `invalidateOwnership` invalidate 6–7 key gồm `courseKeys.all` (`mutations/premium.mutation.js:19-33`).
- Ghi onboarding: `setQueryData` rồi vẫn invalidate cùng key (`:65-77`).
- `getRecommendationCandidates`: 10 subquery tương quan mỗi khoá (`db/onboarding.db.js:185-238`).

**L7 — Admin**

- `/admin/courses` trả mọi khoá + cả taxonomy, dùng làm ô chọn khoá ở 3 nơi.
- 23 mutation `useAdminWrite` invalidate `adminKeys.all` + `courseKeys.all`.
- Poll: dashboard, activity, system 60 s; run list 15 s; run detail 5 s.
- Query inline không dùng preset của `lib/queryTimes.js`; `adminUser.db.js:140` dùng `t.*`.

**L8 — Phần còn lại**

- Mọi dòng trong bảng rà soát chưa được luồng nào xử lý: `session`, `emailToken`, `accountPurge`, `media`, `announcement`, `deadLetter`, `team` (vòng lặp theo thành viên/người được mời, `services/team.service.js:60-123`), job và cron.
- Đọc hết phần thân các SQL function lớn chưa ai rà: `learning_progress_content`, `submit_lesson`, `apply_payment_event`.
- Ba bản sao `withTransaction` (`lib/dbTransaction.js`, `db/challenge.db.js:4-26`, `db/session.db.js:12-34`) gộp về một.

### 5.5 Quy trình mỗi luồng

1. Đo: số request khi tải trang, số round trip mỗi thao tác chính; ghi vào bảng rà soát.
2. Điền kết luận checklist cho mọi dòng của luồng.
3. Sửa, mỗi thay đổi có test: test hành vi hiện có vẫn pass, thêm test khoá round trip cho thao tác đã sửa.
4. Đo lại, ghi số sau. `npm test`, `npm run lint`; có migration thì `npm run db:compare`.
5. Một luồng = một nhánh + một PR vào `develop`.

Sau L1 và sau L8: chạy stress local (`npm run load:run -- --env .env.loadtest --profile stress --inngest inline --max-vus 200 --sessions 200`) và so với `2026-11-14-loadtest-stress-3.md`; N không được giảm.

Mỗi luồng có plan triển khai riêng, viết khi tới lượt (số đo của luồng trước ảnh hưởng luồng sau). Plan đầu tiên gồm bước 0 + L0.

## 6. Ràng buộc

- Thay đổi DB qua `db/migrations` + `db/tools/export-schema.mjs`; file trong `db/functions/` không sửa tay.
- `migrate.mjs` bọc migration trong transaction: không dùng `CREATE INDEX CONCURRENTLY`.
- Đọc qua `GET` route, ghi qua server action, không gọi `db/*` từ route/action/component (`docs/api-conventions.md`).
- State client theo `docs/state-management.md`; không copy dữ liệu server vào Zustand.
- Đổi shape response thì sửa mọi consumer trong cùng PR; không giữ field cũ "phòng hờ".
- Không thêm dependency.

## 7. Để lại cho người làm

- Cách cài bộ đếm (bọc client của pool thế nào, tên env, dạng dòng log).
- Cách bỏ từng lượt gọi thừa cụ thể (ví dụ chuông: endpoint đếm riêng hay tải list khi mở; `RankUpWatcher`: khi nào mới cần hỏi server), miễn đạt ngân sách và không phạm §3.
- Có thêm index hay không, theo `EXPLAIN`.
- Thứ tự sửa trong một luồng; tách một luồng thành nhiều PR nếu diff quá lớn.
- Cập nhật hành trình k6 khi bỏ/gộp endpoint (`loadtest/k6/journeys/learner.js:56` đang gọi `/api/ranking/me`), giữ tỷ lệ hành trình như cũ.