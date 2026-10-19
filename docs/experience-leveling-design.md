# CodeDev — Experience & Leveling Plan (v5)

Trạng thái: thiết kế, chưa triển khai. Liên quan: [premium-onboarding-design.md](premium-onboarding-design.md)
(điểm, entitlement, gợi ý course), [sandbox.md](sandbox.md) (chấm coding phía server), [db/README.md](../db/README.md).

## Thay đổi so với v4

v5 giữ mục tiêu và các con số chính của v4. Phần thay đổi là để khớp với những gì CodeDev đã có,
thay vì dựng song song một hệ thống thứ hai.

| # | Hạng mục | v4 | v5 |
|---|---|---|---|
| 1 | Quiz challenge | Giả định mỗi quiz là **một câu đúng/sai**; multi-selection “sẽ cập nhật” | Quiz hiện là **một bộ câu hỏi** (`single_choice` và `multiple_choice` đều đã có), đạt khi ≥ 70% điểm (`QUIZ_PASS_RATIO`), tối đa 3 lượt (`MAX_QUIZ_ATTEMPTS`). EXP tính **theo quiz challenge đạt**, theo độ khó, giảm một nửa nếu đạt ở lượt 2–3 (§3). |
| 2 | Coding challenge | “Giải bài toán” / “Fix bug” | Ánh xạ trực tiếp vào type có sẵn: `mini_coding` / `fix_bug`; độ khó lấy từ `challenge.challenges.difficulty` (`easy`/`medium`/`hard`). |
| 3 | Ledger | Bảng mới `experience_transactions` + `user_experience` | Bảng `profile.exp_transaction`, **cùng thiết kế** với `profile.point_transaction`; tổng cache trên `profile.info` (`exp`, `exp_level`); một hàm ghi duy nhất `public.post_exp`, giống `post_points` (§7, §8). EXP vẫn **tách hẳn** điểm: điểm là tiền tiêu được, EXP không bao giờ giảm khi tiêu. |
| 4 | Course tier | Bảng mới `course_tier_configs`, cột `difficulty_tier` | Dùng `catalog.course.level` (`beginner`…`master`) làm tier; khoảng Level đề xuất là hằng số theo level, có thể override bằng 2 cột nullable trên `catalog.course` (§6.1). |
| 5 | Prerequisite | Bảng mới `course_prerequisites` | Dùng `catalog.course_prerequisite` đã có. |
| 6 | Gợi ý course | Thuật toán và endpoint mới `course-recommendations` | Mở rộng `services/recommendation.service.js` (đã chấm điểm kèm lý do, đã xét prerequisite và độ khó) bằng tín hiệu User Level; dùng route `/api/recommendations` hiện có (§6.3). |
| 7 | Sự kiện | `POST /internal/experience/events`, outbox | Bỏ. App là monolith: EXP được cộng **trong cùng transaction** với việc hoàn thành lesson / lưu bài nộp, như điểm hiện nay. Thông báo dùng realtime event có sẵn (`publishToUser`). |
| 8 | Cấu hình EXP | `experience_rules` có version | `profile.exp_rule` (một dòng mỗi `rule_key`, không version). Ledger lưu số EXP thực cấp và `rule_key`, nên lịch sử không đổi khi sửa rule. |
| 9 | Course completion | Điều kiện theo tỷ lệ quiz + coding | Giai đoạn 1 dùng định nghĩa hiện có (hoàn thành mọi lesson, `submit_lesson`); điều kiện chặt hơn là quyết định mở (§5, §13). |
| 10 | EXP ước tính | Giả định theo tier (Tier 2 ≈ 400) | Tính khi đọc từ nội dung thật. Hai course thật ≈ 745 và 936 EXP gồm bonus (§6.4). |
| 11 | API | `/api/v1/...` | Theo quy ước hiện có: `/api/user/...`, `/api/course/...` (§9). |
| 12 | Chống gian lận coding | Không nêu | Ghi rõ: EXP coding chỉ chống được payload giả khi bật code runner (`CODE_RUNNER_URL`); production trên Vercel hiện chưa bật (§3.3). |
| 13 | Dữ liệu cũ | Không nêu | Backfill EXP cho hoạt động đã hoàn thành trước khi phát hành (§12). |

---

## 1. Mục tiêu

- Khuyến khích học đều và thực hành coding.
- Thưởng theo hoạt động hợp lệ, không thưởng trùng khi nộp lại hoặc học lại.
- Phân biệt User Level (tích lũy), độ khó course và quyền truy cập course.
- Cân bằng được bằng cấu hình (`profile.exp_rule`, `profile.exp_level`), không phải sửa business logic.

## 2. Nguyên tắc

1. Nguồn EXP: lesson, quiz challenge, coding challenge (`mini_coding`, `fix_bug`), course completion; sau này project, achievement.
2. User Level chỉ phụ thuộc tổng EXP tích lũy; không cần hoàn thành course mới lên Level.
3. **EXP ≠ điểm.** Điểm (`profile.info.points`, `profile.point_transaction`) là số dư tiêu được để đổi course (`redeem_course_points`). EXP không bao giờ giảm khi người dùng tiêu điểm. Hai ledger độc lập, cùng được ghi tại cùng thời điểm.
4. Quyền truy cập course chỉ do entitlement (`has_course_access`) và `catalog.course_prerequisite` quyết định; User Level chỉ dùng để gợi ý.
5. Mọi thay đổi EXP đi qua ledger append-only; sửa sai bằng giao dịch adjustment.
6. Backend quyết định số EXP; client chỉ gửi hành động/bài làm.

## 3. Bảng EXP khởi điểm

### 3.1 Giá trị

| Hoạt động | `rule_key` | EXP | Điều kiện | Trạng thái |
|---|---|---:|---|---|
| Hoàn thành lesson | `lesson` | 10 | Lần đầu `submit_lesson` thành công | Đang có |
| Quiz challenge dễ | `quiz.easy` | 5 | Lượt **đạt đầu tiên** (≥ 70%) | Đang có |
| Quiz challenge trung bình | `quiz.medium` | 8 | Như trên | Đang có |
| Quiz challenge khó | `quiz.hard` | 12 | Như trên | Đang có |
| Coding `mini_coding` dễ / trung bình / khó | `coding.mini_coding.{easy,medium,hard}` | 10 / 20 / 35 | Lần đầu pass mọi test (gồm test ẩn) | Đang có |
| Coding `fix_bug` dễ / trung bình / khó | `coding.fix_bug.{easy,medium,hard}` | 8 / 15 / 25 | Như trên | Đang có |
| Hoàn thành course `beginner` | `course.beginner` | 50 | `learning.register.status` chuyển `completed` | Đang có |
| Hoàn thành course `intermediate` | `course.intermediate` | 100 | Như trên | Đang có |
| Hoàn thành course `advanced` | `course.advanced` | 150 | Như trên | Đang có |
| Hoàn thành course `expert` / `master` | `course.expert`, `course.master` | 200 | Như trên | Đang có |
| Lesson video | `lesson.video` | 10 | Tỷ lệ xem do server ghi nhận | Sẽ cập nhật |
| Mini project / capstone | `project.mini`, `project.capstone` | 50 / 100 | Đạt rubric | Đề xuất |
| Achievement | `achievement` | 20–50 | Theo tiêu chí công bố | Đề xuất |

Các dòng “Sẽ cập nhật”/“Đề xuất” được tạo sẵn trong `profile.exp_rule` với `is_active = false`.

Lý do:
- Quiz gồm nhiều câu và cần ≥ 70% điểm, nên đoán mò khó đạt hơn một câu đúng/sai; giá trị vẫn thấp hơn coding cùng độ khó để quiz không thay được thực hành.
- `fix_bug` ≈ 75% `mini_coding` cùng độ khó vì đã có sẵn khung code.

### 3.2 Làm lại

- **Quiz challenge:** EXP cấp **một lần**, ở lượt đạt đầu tiên.
  - Đạt ở lượt 1: 100% EXP. Đạt ở lượt 2 hoặc 3: 50% (làm tròn lên). Sau khi đã đạt, các lượt sau không cộng.
  - Lý do giảm thay vì 0: sau một lượt trượt, người học chỉ biết điểm tổng, chưa chắc biết từng đáp án (câu `multiple_choice`), nên vẫn đáng thưởng một phần.
  - Số lượt do server đếm từ các lượt đã lưu, không theo cờ của client. Đã kiểm chứng: `challengeDb.saveQuizAttempt` giữ `pg_advisory_xact_lock` theo (user, challenge) rồi mới đếm lượt trong cùng transaction, nên lượt đang nộp biết chính xác mình là lượt thứ mấy.
- **Coding:** chỉ lần đầu đạt `passed` được cộng; không giới hạn số lần nộp trước đó ngoài `coding_configs.max_attempts` đã có.
- **`fix_bug`:** nộp lại nguyên starter code (cùng SHA-256 với file starter) bị từ chối trước khi chấm và không dùng mất lượt.
- **Lesson / course:** chỉ lần đầu.

### 3.3 Chống cộng trùng và gian lận

- Mỗi nguồn chỉ được thưởng một lần: unique `(user_id, source_type, source_id)` trên `profile.exp_transaction`, giống `uq_point_transaction_source`. Retry hoặc nộp lại trả về giao dịch cũ, không cộng thêm.

  | Nguồn | `source_type` | `source_id` |
  |---|---|---|
  | Lesson | `lesson` | `course.lesson.id` |
  | Quiz / coding | `challenge` | `challenge.challenges.id` |
  | Course completion | `course` | `catalog.course.id` |
  | Adjustment | `adjustment` | không dùng; khóa bằng `idempotency_key` do admin tool sinh |

- Sửa nội dung lesson không mở thêm lượt thưởng vì khóa là id, không có version. Muốn thưởng lại thì phát hành lesson/course mới.
- Đáp án quiz không gửi về client trước khi nộp; quiz đã chấm ở server.
- **Coding:** EXP chỉ đáng tin bằng kết quả chấm.
  - Khi bật code runner (`CODE_RUNNER_URL`), server tự chạy mọi test và bỏ qua output trình duyệt gửi lên (xem [sandbox.md](sandbox.md)).
  - Khi chưa bật (production Vercel hiện tại), output do trình duyệt báo về và **có thể bị giả**; điều này đã đúng với điểm hiện nay. Tiêu chí “không thể nhận EXP bằng cách sửa payload” chỉ đạt khi production có code runner.
- Giám sát (không chặn tự động): EXP/ngày vượt p99, tỷ lệ đạt quiz lượt 1 cao bất thường kèm thời gian làm quá ngắn, nhiều tài khoản nộp cùng một lời giải (`code_sha256` đã lưu trong snapshot bài nộp).

## 4. Bảng User Level

Giữ nguyên bảng v4. Một ngày học điển hình ≈ **63 EXP**: 2 lesson (20) + 1 quiz trung bình đạt lượt 1 (8) + 1 `mini_coding` trung bình (20) + 1 `fix_bug` trung bình (15). Chưa tính course bonus.

| Level | Danh hiệu | Nhóm | EXP tối thiểu | Ước tính ngày học |
|---:|---|---|---:|---:|
| 1 | Newbie | Khởi đầu | 0 | 0 |
| 2 | Beginner | Khởi đầu | 100 | 2 |
| 3 | Beginner+ | Khởi đầu | 250 | 4 |
| 4 | Learner | Nền tảng | 450 | 7 |
| 5 | Learner+ | Nền tảng | 700 | 11 |
| 6 | Apprentice | Nền tảng | 1.000 | 16 |
| 7 | Apprentice+ | Nền tảng | 1.400 | 22 |
| 8 | Developer | Developer | 1.900 | 30 |
| 9 | Developer+ | Developer | 2.500 | 40 |
| 10 | Skilled Developer | Developer | 3.200 | 51 |
| 11 | Skilled Developer+ | Developer | 4.000 | 63 |
| 12 | Specialist | Chuyên sâu | 4.900 | 78 |
| 13 | Specialist+ | Chuyên sâu | 5.900 | 94 |
| 14 | Advanced Developer | Chuyên sâu | 7.000 | 111 |
| 15 | Advanced Developer+ | Chuyên sâu | 8.300 | 132 |
| 16 | Expert | Expert | 9.800 | 156 |
| 17 | Expert+ | Expert | 11.500 | 183 |
| 18 | Master | Master | 13.500 | 214 |
| 19 | Master+ | Master | 16.000 | 254 |
| 20 | Grandmaster | Master | 19.000 | 302 |

- `exp_level = MAX(level) WHERE min_exp <= exp AND is_active` trên `profile.exp_level`.
- Level 20 là mức cao nhất: EXP vẫn cộng; API trả `nextLevel = null`, `progressPercent = 100`.
- Thêm Level 21+ chỉ là thêm dòng vào `profile.exp_level` rồi chạy câu lệnh tính lại `exp_level`.
- **Adjustment:** chỉ admin, bắt buộc `reason`; `exp` không xuống dưới 0 (chỉ trừ tới 0 và ghi đúng số đã trừ). Level được tính lại và có thể giảm **chỉ** do adjustment; hoạt động học không bao giờ làm giảm Level.
- **Không dùng `profile.info.level`** (enum `level_enum`, cột cũ) cho User Level số, để không nhầm hai khái niệm.

## 5. Độ khó course và điều kiện hoàn thành

Tier là `catalog.course.level`:

| `catalog.course.level` | Tương ứng v4 | Completion bonus |
|---|---|---:|
| `beginner` | Tier 1 | 50 |
| `intermediate` | Tier 2 | 100 |
| `advanced` | Tier 3 | 150 |
| `expert`, `master` | Tier 4 | 200 |

**Giai đoạn 1:** bonus EXP cấp tại đúng chỗ `submit_lesson` đặt `learning.register.status = 'completed'` (mọi lesson đã hoàn thành; một lesson chỉ hoàn thành được khi đã đạt mọi challenge đang publish của nó, `challengeDb.getLessonChallenges`) và cộng điểm thưởng `catalog.course.reward`. Một định nghĩa “hoàn thành” duy nhất cho điểm, EXP, roadmap và gợi ý.

**Giai đoạn sau (quyết định mở §13):** điều kiện chặt hơn, theo v4 §5 (tỷ lệ quiz đạt, pass mọi coding bắt buộc). Việc này đổi nghĩa “hoàn thành course” cho cả điểm và tiến độ, nên làm như một thay đổi riêng, không gói vào EXP.

## 6. Level đề xuất và gợi ý course

### 6.1 Level đề xuất

| `catalog.course.level` | Level đề xuất |
|---|---|
| `beginner` | 1–5 |
| `intermediate` | 4–9 |
| `advanced` | 8–14 |
| `expert`, `master` | 13–20 |

- Là hằng số trong `recommendation.service.js`. Course có thể override bằng `catalog.course.recommended_min_level` / `recommended_max_level` (nullable).
- Các khoảng chồng nhau 1–2 Level để có giai đoạn chuyển tiếp.

### 6.2 Nhãn phù hợp (`fit`)

Theo thứ tự ưu tiên:

| Điều kiện | `fit` | Hành vi |
|---|---|---|
| `learning.register.status = 'completed'` | `completed` | Không gợi ý |
| Thiếu prerequisite (`catalog.course_prerequisite`) | `locked` | “Cần hoàn thành trước: …” |
| `level > max` | `review` | Cho học; xếp thấp |
| `min ≤ level ≤ max` | `suitable` | Ưu tiên |
| `min − 2 ≤ level < min` | `challenge` | Cho học; ghi chú “hơi khó so với Level hiện tại” |
| `level < min − 2` | `too_early` | Cho học nếu đã có quyền; cảnh báo; không gợi ý |

`level` là `exp_level` của người xem.

### 6.3 Gợi ý: mở rộng recommender hiện có

`services/recommendation.service.js` đã lọc ứng viên (đã publish, chưa học, chưa hoàn thành), cộng điểm có lý do (vai trò, kỹ năng, mục tiêu, prerequisite, ngôn ngữ…), và có `levelSignal` dựa trên trình độ tự khai lúc onboarding (`experience_level`).

Thay đổi:
- Khi người dùng đã có EXP (`exp > 0`), `levelSignal` dùng `fit` ở §6.2 thay cho trình độ tự khai: `suitable` +15, `challenge` +5, `review` −10, `too_early` −20 (giữ đúng thang `WEIGHTS` hiện có). Người dùng mới (`exp = 0`) vẫn dùng trình độ onboarding.
- `locked` đã được xử lý bằng tín hiệu `prerequisiteMissing` hiện có.
- Mỗi item trả thêm `recommendedLevel { min, max }`, `fit`, `estimatedExp`, `projectedLevel`.
- “Tiếp nối lộ trình” và “cùng chủ đề” của v4 đã có tương đương (learning path theo vai trò, prerequisite đã hoàn thành); không thêm `track_id` (nếu cần, `catalog.course.category_id` là chủ đề).
- Điều chỉnh theo phong độ (±2 Level) và placement test: để sau, khi có dữ liệu.

### 6.4 EXP ước tính mỗi course

`estimatedExp` = 10 × số lesson + EXP tối đa của mọi challenge đã publish (quiz tính đạt lượt 1) + completion bonus theo level. Tính khi đọc bằng một truy vấn gộp; không lưu cột, nên luôn đúng khi nội dung thay đổi.

Số liệu thật với các giá trị §3.1 (2026-10-18, sau khi 9 lesson cũ của JS-async được viết lại):

| Course | Lesson | Quiz | Coding | Bonus | Tổng ≈ |
|---|---:|---:|---:|---:|---:|
| `nodejs-high-performance` (`intermediate`, 12 lesson, 37 challenge) | 120 | 152 | 373 | 100 | **745** |
| `javascript-async-architecture_2026100901` (`intermediate`, 18 lesson, 43 challenge) | 180 | 163 | 493 | 100 | **936** |

Course thật vẫn cho nhiều EXP hơn giả định v4 (Tier 2 ≈ 400), chủ yếu do coding `hard`. Với ≈ 750–940 EXP, khoảng 2–3 course `intermediate` đủ để đi hết khoảng Level 4–9. Cần kiểm tra lại khi có thêm course (§13).

`projectedLevel = levelFor(exp + estimatedExp)`.

## 7. Data model

Một migration mới, chạy sau `20261017_004` / `20261017_005`. Chỉ thêm (expand-only).

### Dùng lại (không đổi)
- `challenge.challenges.type` (`quiz`, `mini_coding`, `fix_bug`) và `.difficulty`.
- `learning.history` (lesson hoàn thành), `learning.register` (course hoàn thành).
- `catalog.course.level`, `catalog.course_prerequisite`, `catalog.course.category_id`.

### `profile.exp_transaction` (ledger, append-only)
Cùng hình dạng với `profile.point_transaction`:
- `id` uuid PK
- `user_id` bigint NOT NULL → `identity.users`
- `amount` int NOT NULL, `CHECK (amount <> 0)` (âm chỉ với adjustment)
- `source_type` varchar NOT NULL (`lesson`, `challenge`, `course`, `adjustment`)
- `source_id` bigint (NULL với adjustment)
- `rule_key` varchar (NULL với adjustment)
- `exp_after` bigint NOT NULL, `CHECK (exp_after >= 0)`
- `idempotency_key` varchar(120)
- `actor_id` bigint (admin của adjustment), `reason` text (`CHECK` bắt buộc khi `source_type = 'adjustment'`)
- `metadata` jsonb (số lượt quiz, `submission_id`, `backfill: true`…)
- `created_at` timestamptz NOT NULL DEFAULT now()
- Unique `(user_id, source_type, source_id) WHERE source_id IS NOT NULL`; unique `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`; index `(user_id, created_at DESC, id DESC)` cho phân trang.

### Cache trên `profile.info`
- `exp` bigint NOT NULL DEFAULT 0, `CHECK (exp >= 0)`
- `exp_level` int NOT NULL DEFAULT 1
- View `profile.exp_drift` (giống `point_balance_drift`): user có `info.exp` khác tổng ledger.

### `profile.exp_rule`
- `rule_key` varchar PK, `amount` int NOT NULL `CHECK (amount > 0)`, `is_active` boolean NOT NULL, `updated_at`.
- Seed theo §3.1.

### `profile.exp_level`
- `level` int PK, `title` varchar NOT NULL, `min_exp` bigint UNIQUE NOT NULL, `is_active` boolean NOT NULL.
- Seed theo §4; Level 1 có `min_exp = 0`.

### `catalog.course`
- Thêm `recommended_min_level` int NULL, `recommended_max_level` int NULL, `CHECK (recommended_max_level >= recommended_min_level)`.

## 8. Luồng ghi nhận

**`public.post_exp(_user_id, _amount, _source_type, _source_id, _rule_key, _idempotency_key, _actor_id, _reason, _metadata)`** là hàm ghi EXP duy nhất. Hàm làm, trong transaction của người gọi:
1. Khóa `profile.info` của user (`FOR UPDATE`).
2. Nếu đã có giao dịch cùng nguồn hoặc cùng `idempotency_key`: trả `created = false`, không làm gì thêm.
3. Tính `exp_after = GREATEST(exp + _amount, 0)`, ghi ledger với `amount = exp_after − exp` (bỏ qua nếu bằng 0).
4. Cập nhật `info.exp`, tính lại `exp_level` từ `profile.exp_level`.
5. Trả `(created, exp_after, old_level, new_level)`.

Gọi ở đúng những chỗ đang gọi `post_points`, trong cùng transaction:

| Sự kiện | Chỗ gọi | `rule_key` |
|---|---|---|
| Hoàn thành lesson | `public.submit_lesson` | `lesson` |
| Hoàn thành course | `public.submit_lesson` (nhánh `status = 'completed'`) | `course.<level>` |
| Quiz đạt | `challengeDb.saveQuizAttempt` (cạnh `awardChallengePoints`) | `quiz.<difficulty>`, 50% nếu lượt ≥ 2 |
| Coding đạt | `challengeDb.finalizeCodingSubmission` | `coding.<type>.<difficulty>` |
| Adjustment | `admin.db.js` (cạnh điều chỉnh điểm) | `idempotency_key` từ admin tool |

- Số EXP đọc từ `profile.exp_rule` ở server; rule `is_active = false` thì không cấp.
- **Thứ tự khóa:** `post_points` và `post_exp` cùng khóa dòng `profile.info`; luôn gọi `post_points` trước rồi `post_exp` trong cùng transaction, nên lần khóa thứ hai đã thuộc về transaction đó và không gây deadlock.
- **Quiz đồng thời:** hai lượt nộp cùng lúc không thể cùng được cộng nhờ unique theo nguồn. Số lượt (để tính 50%) lấy từ phép đếm `saveQuizAttempt` đã làm sau `pg_advisory_xact_lock`: lượt hiện tại = `attempts + 1`.
- **Sửa bộ câu hỏi của quiz đã có người làm:** không thêm câu vào quiz đang dùng. Lượt cũ được chấm lại theo bộ câu hỏi hiện tại (`evaluateQuizHistory`), nên lượt đã đạt có thể thành trượt. Câu mới đi vào quiz mới.
- **Thông báo:** `afterSubmission` / `publishToUser` hiện có gửi thêm `expAwarded`, `level`, `levelsGained` (danh sách mọi Level vừa vượt). Không cần outbox.

## 9. API

Theo quy ước route hiện có:

| Route | Nội dung |
|---|---|
| `GET /api/user/experience` | `totalExp`, `currentLevel`, `currentLevelTitle`, `currentLevelMinExp`, `nextLevel`, `nextLevelMinExp`, `expToNextLevel`, `progressPercent` |
| `GET /api/user/experience/transactions?cursor=&limit=20` | Lịch sử EXP, cursor `(created_at, id)` |
| `GET /api/experience/levels` | Bảng Level công khai |
| `GET /api/course/courses` | Thêm `recommendedLevel`, `estimatedExp`; khi đăng nhập thêm `fit`, `projectedLevel` |
| `GET /api/recommendations` | Thêm `fit`, `recommendedLevel`, `estimatedExp`, `projectedLevel` trên mỗi item |
| `POST /api/admin/experience/adjust` | Chỉ admin, bắt buộc `reason`, ghi `identity.audit_log` như điều chỉnh điểm |

`GET /api/user/overview` (đang trả thông tin tổng quan) có thể nhúng luôn khối experience để dashboard không phải gọi thêm.

Ví dụ `GET /api/user/experience`:
```json
{
  "totalExp": 1950,
  "currentLevel": 8,
  "currentLevelTitle": "Developer",
  "currentLevelMinExp": 1900,
  "nextLevel": 9,
  "nextLevelMinExp": 2500,
  "expToNextLevel": 550,
  "progressPercent": 8.33
}
```
Ở Level 20: `nextLevel`, `nextLevelMinExp`, `expToNextLevel` là `null`, `progressPercent` là `100`.

Không có endpoint nào để client tự cộng EXP.

## 10. Versioning và cân bằng

- Ledger lưu số EXP thực cấp và `rule_key`; sửa `profile.exp_rule` chỉ ảnh hưởng giao dịch sau đó.
- Đổi ngưỡng Level: `exp` giữ nguyên, chạy lệnh tính lại `exp_level` cho mọi user. Nếu có user bị giảm Level, quyết định trước và thông báo trước (§13).
- Theo dõi: EXP trung bình/người/ngày, phân bổ theo `rule_key`, thời gian ở mỗi Level, tỷ lệ đạt quiz lượt 1, số lần nộp trước khi pass (tách `mini_coding` / `fix_bug`).
- Rà soát sau 2–4 tuần dữ liệu thật.

## 11. Tiêu chí nghiệm thu

- Gọi lại `submit_lesson` / nộp lại challenge đã đạt không tạo thêm giao dịch EXP.
- Hai lượt nộp quiz đồng thời đều đạt: chỉ một giao dịch EXP.
- Quiz đạt lượt 1: 100% EXP theo độ khó; đạt lượt 2–3: 50%; lượt sau khi đã đạt: 0.
- Coding nhận đúng `coding.<type>.<difficulty>`; nộp nguyên starter của `fix_bug` bị từ chối và không mất lượt.
- Course completion bonus cấp đúng một lần, theo `catalog.course.level`.
- Tiêu điểm (redeem course) không làm đổi `exp` hay `exp_level`.
- Level đúng khi vượt một hoặc nhiều ngưỡng trong một lần cộng; `levelsGained` liệt kê đủ.
- Level 20: `nextLevel = null`, `progressPercent = 100`, EXP vẫn cộng.
- Adjustment âm không làm `exp < 0`, tính lại Level đúng; thiếu `reason` bị từ chối.
- `profile.exp_drift` rỗng sau mọi test.
- Nhãn `fit` đúng tại các biên `min − 3`, `min − 2`, `min − 1`, `min`, `max`, `max + 1`; course thiếu prerequisite luôn là `locked`; override trên `catalog.course` thắng hằng số theo level.
- `projectedLevel = levelFor(exp + estimatedExp)`.
- Backfill chạy hai lần cho cùng kết quả.
- Khi bật code runner: nộp coding với output giả (trình duyệt báo pass, runner báo fail) không được cộng EXP.

## 12. Triển khai

1. **Điều kiện trước:** migration `20261017_004` / `005` đã được áp ở local và production (hiện local còn thiếu).
2. Migration: `profile.exp_transaction`, cột `exp`/`exp_level`, `profile.exp_rule`, `profile.exp_level` (kèm seed), view `profile.exp_drift`, hàm `public.post_exp`, 2 cột trên `catalog.course`; cập nhật `submit_lesson` để gọi `post_exp`.
3. Gọi `post_exp` ở `challenge.db.js` (quiz, coding) và `admin.db.js`; trả `expAwarded`/`levelsGained` qua realtime.
4. **Backfill** (một lần, idempotent nhờ unique theo nguồn, `metadata.backfill = true`): lesson `completed` trong `learning.history`, challenge đã đạt, course `completed` trong `learning.register`, theo giá trị rule hiện tại. Quiz cũ tính 100% (không truy được lượt chính xác cho mọi dữ liệu cũ).
5. API §9 và UI: Level/thanh tiến độ trên dashboard và navbar, badge Level đề xuất và `fit` trên course card.
6. Recommender §6.3.
7. Sau khi có dữ liệu: điều kiện hoàn thành chặt hơn, điều chỉnh theo phong độ, placement test, project, achievement.

Mỗi bước đi theo quy trình trong [db/README.md](../db/README.md): áp local, thử trên Neon branch, rồi production; `npm run db:compare` sạch.

## 13. Quyết định còn mở

| Câu hỏi | Mặc định v5 |
|---|---|
| Quiz đạt ở lượt 2–3 được bao nhiêu? | 50% EXP. Phương án khác: 0 (như v4) hoặc 100%. |
| Giá trị quiz theo độ khó (5 / 8 / 12) | Đề xuất; kiểm chứng bằng thời gian làm thực tế. |
| `master` dùng chung khoảng Level với `expert`? | Có (13–20, bonus 200). Phương án khác: `master` 16–20, bonus 250. |
| Điều kiện hoàn thành course | Giai đoạn 1: mọi lesson (như hiện nay). Điều kiện theo quiz/coding làm sau, như một thay đổi riêng. |
| Backfill dữ liệu cũ | Có, theo giá trị hiện tại; quiz cũ 100%. Phương án khác: mọi người bắt đầu từ 0. |
| Course thật cho nhiều EXP hơn giả định v4 (≈ 745 và 936 cho hai course `intermediate`) | Giữ ngưỡng Level; xem lại khi có ≥ 5 course. Phương án khác: giảm giá trị coding hoặc tăng ngưỡng. |
| Bật code runner ở production? | Chưa (Vercel). Cần cho tiêu chí “không giả được EXP coding”; là quyết định hạ tầng riêng. |
| Đổi ngưỡng làm user tụt Level | Cho tính lại, thông báo trước. Phương án khác: lưu Level cao nhất đã đạt. |
| Giới hạn EXP/ngày | Không; chỉ giám sát. |
| User Level có chặn truy cập course? | Không. |
