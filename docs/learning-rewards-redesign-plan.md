# Plan: Level theo EXP, điểm thưởng và cập nhật UI/UX

## Trạng thái triển khai (2026-10-19)

Đợt 1–3 đã triển khai ở **local** (chưa lên production, chưa commit).

**Migration:**
- `20261018_001_experience_levels`: bảng/hàm EXP, `submit_lesson` mới, backfill.
- `20261018_002_progress_challenge_exp`: thêm `exp` cho mỗi challenge trong `learning_progress_content`.
- `20261018_003_drop_profile_star`: **chạy sau khi deploy code mới**, vì code cũ còn đọc `star`.

Khác so với plan bên dưới:
- **Cột `star`** bị xóa ngay trong đợt này, theo yêu cầu. `rank` và `info.level` không còn được đọc; xóa sau (đợt 4).
- **Không thêm** `catalog.course.recommended_min_level` / `recommended_max_level`. Khoảng Level đề xuất là hằng số theo `catalog.course.level` trong `lib/levels.js`; khi cần override theo từng course thì mới thêm cột.
- **Không thêm** sự kiện realtime riêng cho lesson hoàn thành. Tab đang học hiện toast ngay; các tab khác làm mới dữ liệu qua `PROGRESS_UPDATED` có sẵn.
- **Không gộp layout:** `DefaultLayout` có `LevelPointsChip` trên header trang học thay cho một top bar mới. Chip dùng lại được cho trang chi tiết course.
- **Helper trùng:** hai hàm `formatPoints` là hai định dạng khác nhau (rút gọn và đầy đủ), nên giữ cả hai; `initials` và `Stat` chưa gộp.
- **Điều chỉnh EXP của admin:** dùng chung quyền `points.adjust` và form với điều chỉnh điểm.

Spec chi tiết của EXP/Level:
[experience-leveling-design.md](experience-leveling-design.md) (v5). Tài liệu này chốt hướng đi, những gì
đổi so với hiện tại, thứ tự làm và phần UI/UX.

## 1. Mục tiêu

| # | Mục tiêu | Ý nghĩa |
|---|---|---|
| 1 | **Level dựa trên EXP học được** | EXP đến từ lesson, challenge và việc hoàn thành course. Level chỉ tính từ tổng EXP; không bao giờ giảm khi người dùng tiêu điểm. |
| 2 | **Điểm (points) là phần thưởng cho việc làm đúng** | Điểm đến từ việc làm đúng challenge và hoàn thành lesson. Điểm là số dư tiêu được (đổi course). |
| 3 | **UI/UX cập nhật** | Người học luôn thấy Level, tiến độ tới Level kế, điểm, và được phản hồi rõ khi nhận thưởng. Bỏ các số liệu giả đang hiển thị. |

## 2. Hiện trạng (đã kiểm tra trong code)

**Điểm đang chạy đúng hướng, nhưng còn vài chỗ lệch:**
- Mọi thay đổi điểm đi qua một hàm `public.post_points` (khóa `profile.info`, idempotent theo nguồn).
- Lesson: `submit_lesson` cộng cứng 10 điểm, nhưng không trả số điểm về, nên toast chỉ ghi "Lesson marked as completed." (`components/learning/[id]/lessons.jsx:34`).
- Challenge: `awardChallengePoints` (`db/challenge.db.js:28`) cộng `challenge.challenges.points` (quiz 10 / fix_bug 20 / mini_coding 30) khi đạt lần đầu.
- Course: `submit_lesson` cộng thêm `catalog.course.reward` khi xong course. Phần này **không hiện ở đâu trên UI**.
- Tiêu điểm: `redeem_course_points`. Admin: điều chỉnh (`adjusted`) và hoàn (`refunded`).

**Level hiện là số liệu giả:**
- `profile.info.level` (enum `beginner…master`), `rank` và `star` **không bao giờ được ghi**, nên luôn mang giá trị mặc định.
- Vẫn được hiển thị ở 3 nơi: dashboard (`components/home/overview.js:74-78,150-162`; Rank hiện "#0"), profile (`components/profile/profilePage.jsx:393-410`) và contact (`components/contact/contactPage.jsx:293-319`).
- Trình độ tự khai lúc onboarding (`profile.learning_preference.experience_level`) chỉ dùng cho gợi ý course (`services/recommendation.service.js`).

**UI:**
- Hai layout: `HomeLayout` (sidebar + navbar) và `DefaultLayout` (trống). Các trang dùng nhiều nhất khi học (`/learning/[id]`, `/course/[id]`, `/roadmap/[id]`) dùng `DefaultLayout`, nên mất hẳn chỗ hiển thị điểm.
- Code trùng: `formatPoints` có 2 bản cho kết quả khác nhau (`components/ui/navbar.jsx:71`, `components/commerce/format.js:26`), `initials` bị chép 5 lần, `Stat` có 2 bản (`overview.js:48`, `profilePage.jsx:65`).
- Dark mode bật sau khi mount (`contexts/themeContext.jsx`), nên trang chớp sáng trước khi chuyển tối.
- Token `--xp` và `--streak` đã có trong `app/globals.css` nhưng chưa dùng đúng mục đích.
- Chưa có gamification nào khác (badge, streak, bảng xếp hạng, achievement).

## 3. Quyết định thiết kế

### 3.1 EXP và Level: theo spec v5, không đổi

- Ledger riêng `profile.exp_transaction`, cache `profile.info.exp` / `exp_level`, một hàm ghi duy nhất `public.post_exp`, cấu hình bảng `profile.exp_rule` và `profile.exp_level` (20 Level).
- Nguồn EXP: lesson (10), quiz theo độ khó (5 / 8 / 12; đạt ở lượt 2–3 được 50%), coding theo loại và độ khó (`mini_coding` 10 / 20 / 35, `fix_bug` 8 / 15 / 25), bonus hoàn thành course theo `catalog.course.level` (50…200).
- `post_exp` được gọi đúng tại các chỗ đang gọi `post_points`, trong cùng transaction.
- Backfill EXP cho hoạt động đã hoàn thành trước đây.

### 3.2 Điểm: chỉ thưởng cho challenge và lesson

| Nguồn | Điểm hiện tại | Sau thay đổi |
|---|---|---|
| Hoàn thành lesson (lần đầu) | 10 | 10, không đổi |
| Làm đúng challenge (lần đầu) | `challenges.points` (10 / 20 / 30) | Không đổi |
| Hoàn thành course | `catalog.course.reward` | **Thôi cộng điểm**; phần thưởng hoàn thành course chuyển thành **bonus EXP** (§3.1). Điểm đã cộng trước đây giữ nguyên. Cột `reward` để lại, đánh dấu deprecated. |
| Tiêu điểm, admin điều chỉnh / hoàn | Như hiện tại | Không đổi |

Lý do: đúng với yêu cầu "điểm cho việc làm đúng challenge và hoàn thành lesson". Đây cũng là thay đổi nhỏ nhất: bỏ một lệnh `post_points` trong `submit_lesson`, không thêm bảng mới.

### 3.3 Bỏ số liệu giả

- `rank` và `star` bị xóa khỏi API (`db/user.db.js`, `db/social.db.js`) và UI. `profile.info.level` được thay bằng `exp_level` ở mọi nơi hiển thị.
- Các cột trong DB **chưa xóa** (expand-only). Xóa cột là một migration riêng, sau khi code mới đã chạy ổn trên production.

### 3.4 Không làm trong đợt này

Achievement, streak, bảng xếp hạng, notification center, điều kiện hoàn thành course chặt hơn, placement test. Spec v5 §12 bước 7 đã ghi lại các mục này cho giai đoạn sau.

## 4. Backend

| # | Việc | File chính |
|---|---|---|
| B0 | **Điều kiện trước:** migration `20261017_004` / `005` (commerce, entitlement) phải được áp ở local; hiện local còn thiếu. | `db/migrations/` |
| B1 | Migration EXP theo spec v5 §7: bảng, cột, seed rule/level, view `profile.exp_drift`, hàm `public.post_exp`. | `db/migrations/2026xxxx_001_experience.sql` |
| B2 | `submit_lesson`: gọi `post_exp` cho lesson và course; **bỏ** `post_points` cho course; trả thêm `awardedPoints`, `awardedExp`, `level`, `levelsGained`. | `db/functions/public.submit_lesson.sql` (qua migration), `db/course.db.js` |
| B3 | Challenge: gọi `post_exp` cạnh `awardChallengePoints` (quiz kèm hệ số theo lượt, coding theo loại/độ khó); trả `awardedExp` cùng `awardedPoints`. | `db/challenge.db.js`, `services/challenge.service.js` |
| B4 | Admin: điều chỉnh EXP cạnh điều chỉnh điểm, bắt buộc `reason`, ghi `identity.audit_log`. | `services/admin.service.js`, `db/admin.db.js`, `app/api/admin/experience/adjust` |
| B5 | API: `GET /api/user/experience`, `GET /api/user/experience/transactions`, `GET /api/experience/levels`; nhúng khối experience vào `/api/user/me` và `/api/user/overview`; bỏ `rank`/`star`/`level` cũ. | `app/api/user/*`, `db/user.db.js`, `services/user.service.js` |
| B6 | Realtime: payload `CHALLENGE_SUBMITTED` thêm `awardedExp`, `level`, `levelsGained`; thêm sự kiện cho lesson hoàn thành. | `lib/realtime.js`, `services/challenge.service.js`, `services/course.service.js` |
| B7 | Course: `recommendedLevel`, `fit`, `estimatedExp`, `projectedLevel` trên danh sách course và gợi ý (spec v5 §6). | `db/course.db.js`, `services/recommendation.service.js` |
| B8 | Backfill EXP (một lần, idempotent, `metadata.backfill = true`). | script trong `db/tools/` hoặc migration dữ liệu |

**Test** (vitest, theo spec v5 §11, ưu tiên các case dễ sai):
- cộng trùng khi nộp lại / gọi lại;
- hai lượt quiz đồng thời;
- hệ số 50% ở lượt 2–3;
- lên nhiều Level trong một lần cộng;
- Level 20;
- tiêu điểm không đổi EXP;
- **xong course không còn cộng điểm** nhưng có bonus EXP;
- `exp_drift` rỗng.

## 5. UI/UX

### 5.1 Nền tảng (làm trước, nhỏ)

| Việc | Chi tiết |
|---|---|
| Gom helper trùng | Một `formatPoints`, một `initials`, một `Stat` trong `components/ui/`; bỏ các bản chép. |
| Component dùng chung cho thưởng | `LevelBadge` (số Level + danh hiệu), `ExpProgress` (thanh tiến độ tới Level kế, dùng token `--xp`, có `role="progressbar"` và `aria-valuenow`), `PointsPill` (số dư điểm). Mọi trang dùng 3 component này, không tự vẽ. |
| Theme | Thêm script chạy trước khi hydrate để đặt class `.dark`, hết chớp sáng. |
| Thanh trên cho `DefaultLayout` | Một top bar gọn (quay lại, `LevelBadge`, `ExpProgress` thu nhỏ, `PointsPill`) cho trang học, chi tiết course và roadmap. Không gộp hai layout. |

### 5.2 Phản hồi khi nhận thưởng

- **Toast thưởng thống nhất:** "+10 điểm · +10 EXP" khi xong lesson; "+20 điểm · +15 EXP" khi đạt challenge.
  - Dùng chung một hàm qua `showAlert` hiện có.
  - Có `id` chống trùng với toast realtime.
- **Lên Level:** dialog chúc mừng (Level mới, danh hiệu, mở khóa gợi ý course hợp Level). Tắt hiệu ứng chuyển động khi `prefers-reduced-motion`. Nếu vượt nhiều Level một lúc, chỉ hiện một dialog.
- **Tab ẩn:** giữ cơ chế realtime hiện tại (`components/realtime/userRealtimeBridge.jsx`), thêm EXP vào nội dung.

### 5.3 Theo từng trang

| Trang | Thay đổi |
|---|---|
| Navbar (`components/ui/navbar.jsx`) | Thêm `LevelBadge` và `ExpProgress` mini cạnh `PointsPill`; menu tài khoản có dòng "Level N · còn X EXP". |
| Dashboard `/home` (`components/home/overview.js`) | Thay Level / Stars / Rank bằng thẻ Level (tiến độ tới Level kế), số dư điểm, EXP 7 ngày gần nhất, 5 phần thưởng gần nhất từ ledger. |
| Profile `/profile` | Thay lưới Points / Level / Stars / Rank; thêm tab "Lịch sử EXP" (phân trang cursor) và bảng 20 Level (Level hiện tại được tô). |
| Danh sách / chi tiết course | Badge "Đề xuất: Level a–b", nhãn `fit` (Phù hợp / Thử thách / Ôn tập / Quá sớm / Chưa mở khóa), "≈ X EXP · Y điểm", "Hoàn thành → Level N". |
| Trang học `/learning/[id]` | Badge challenge hiện cả điểm và EXP; nút hoàn thành lesson ghi phần thưởng sẽ nhận; top bar §5.1 cập nhật ngay sau khi nhận thưởng. |
| Ví `/orders` | Ghi rõ điểm dùng để đổi course, còn EXP và Level không tiêu được và không bị trừ. |
| Contact | Thay rank/stars bằng `LevelBadge`. |
| Gợi ý course | Lý do kèm Level ("Phù hợp với Level 8 của bạn"). |

### 5.4 Kiểm tra UI

- Chụp màn hình trước/sau ở hai chế độ sáng và tối, desktop và mobile (375 px).
- Kiểm tra a11y: tương phản, thứ tự focus trong dialog lên Level, `aria-live` của toast.
- Kiểm tra trên trình duyệt thật các luồng: xong lesson → toast và top bar; đạt challenge → lên Level → dialog.

## 6. Thứ tự triển khai

| Đợt | Nội dung | Phát hành |
|---|---|---|
| 1 | B0, B1, B2, B3, B8 + test | Migration lên local, thử trên Neon branch, rồi production (quy trình `db/README.md`). Chạy backfill. |
| 2 | B5, B6, UI §5.1, §5.2, navbar, dashboard, profile; bỏ rank/star | Một PR. Người dùng bắt đầu thấy Level. |
| 3 | B4, B7, UI course / trang học / ví / contact / gợi ý | Một PR. |
| 4 | Migration xóa cột `rank`, `star`, `info.level` | Sau khi đợt 2–3 chạy ổn ít nhất 1 tuần. |

Mỗi đợt: `npm test`, `npm run build`, lint không tăng lỗi, `npm run db:compare` sạch.

## 7. Quyết định cần bạn chốt

| Câu hỏi | Mặc định trong plan |
|---|---|
| Hoàn thành course còn cộng điểm không? | **Không**; chỉ còn bonus EXP. Phương án khác: giữ `catalog.course.reward` như hiện tại. |
| Điểm lesson có cấu hình được không? | Giữ cố định 10. Phương án khác: đưa vào bảng cấu hình như `exp_rule`. |
| Quiz đạt ở lượt 2–3 có được điểm không? | Điểm: đủ (như hiện tại). EXP: 50% (spec v5). |
| Backfill EXP cho dữ liệu cũ | Có. |
| Dialog lên Level | Có, một dialog cho mỗi lần cộng. Phương án khác: chỉ dùng toast. |
| Gộp hai layout | Không; thêm top bar gọn cho `DefaultLayout`. |
