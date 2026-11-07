# CodeDev — Kế hoạch Thông báo (inbox, thông báo từ admin, mở rộng)

Trạng thái 2026-11-04. Phần 1 là inbox đã làm (migration `20261104_017`). Phần 2 là việc còn hở của nó. Phần 3 là thông báo do admin gửi. Phần 4 là các hướng mở rộng. Phần 5 là thứ tự làm.

## 0. Đã làm đợt 1 đến 3 (2026-11-04)

| Đợt | Đã làm | Ở đâu |
|---|---|---|
| 1 | Gỡ từng mục (`PATCH { ids, dismiss: true }`, nút "Remove" trên `/notifications`) | `db/notification.db.js` `dismiss`, `useDismissNotifications` |
| 1 | Vùng `aria-live` đọc "N new notifications" khi số chưa đọc tăng | `components/ui/notificationCenter.jsx` |
| 1 | Toast theo theme của app | `components/shadcn/sonner.jsx` |
| 1 | Chuông trong màn học | `components/learning/[id]/studyingPage.jsx` |
| 1 | Bảng kind dùng chung, nhãn "CodeDev team" cho dòng do admin gửi hoặc gây ra | `constants/notifications.js` |
| 1 | `read_at` (đặt khi đọc hoặc gỡ) | migration `20261104_018` |
| 1 | Test producer | `__tests__/notifications/producers.test.js` |
| 2 | Thông báo tự động: feedback đã xử lý, bình luận / đánh giá bị ẩn, điểm / EXP được điều chỉnh, được gán role | `services/{adminFeedback,adminRating,admin,adminUser}.service.js` |
| 3 | `ops.announcement`, permission `announcement.send`, gửi theo lô qua Inngest (`announcement/send`) hoặc chạy ngay khi tắt queue, hẹn giờ, huỷ, thu hồi, sweeper gửi lại bản quá hạn | `db/announcement.db.js`, `services/announcement.service.js`, `jobs/announcement.js` |
| 3 | API `GET/POST /api/admin/announcements`, `POST .../preview`, `PATCH .../[id]` | `app/api/admin/announcements` |
| 3 | Màn `/admin/announcements` (danh sách, số người nhận, tỉ lệ đọc, huỷ / thu hồi) và `/admin/announcements/new` (form, xem trước, đếm người nhận, xác nhận) | `components/admin/announcements` |
| 3 | Nút "Send notification" trên trang user admin, mở form với `?user=<username>` | `components/admin/users/userDetail.jsx` |
| 3 | Kênh public `broadcast`, client làm mới inbox sau 0 đến 20 giây | `lib/realtime.js`, `components/realtime/userRealtimeBridge.jsx` |

| 6 (web push) | Beams Authenticated Users: `lib/beams.js` (publish / token / delete user), `GET /api/pusher/beams-auth`, push trong `notify` và từng lô announcement, `deleteBeamsUser` khi phiên bị thu hồi từ xa, `public/service-worker.js`, `lib/beamsClient.js`, công tắc "Browser notifications" trong Settings | `docs/superpowers/specs/2026-11-07-beams-web-push-design.md` |

Khác với thiết kế bên dưới:
- **Chưa có `severity`, `channels`, `ends_at`.** Chỉ banner (đợt 4) cần chúng, nên để migration của đợt 4 thêm.
- **Tin nhắn riêng (A2) không có route riêng.** Nó là một announcement với `audience = users` một người, nên vào được danh sách, đếm được đã đọc và thu hồi được. Không có kind `admin_message`: mọi dòng do admin gửi đều là `announcement`.
- **Chuông chưa có trong trang admin.** Admin làm việc ở đó, không học.
- **Lý do nội bộ không bao giờ tới người học.** Thông báo ẩn nội dung hay điều chỉnh điểm chỉ nói việc gì đã xảy ra.
- **Hẹn giờ cần Inngest.** Khi queue tắt, gửi ngay chạy trong request, còn hẹn giờ bị từ chối với 422.
- **Inngest local chạy trong Docker** (`compose.yml`, URL `host.docker.internal`). Gọi `PUT /api/inngest` từ máy host sẽ đăng ký lại app bằng `localhost`, container không gọi tới được. Đồng bộ lại bằng header `Host: host.docker.internal:3000`.

## 1. Đã có

| Thành phần | Ở đâu |
|---|---|
| Bảng `profile.notification`: `kind`, `title`, `message`, `link`, `has_seen`, `dedupe_key` (unique theo `user_id, kind, dedupe_key`) | `db/migrations/20261104_017_notification_inbox.sql` |
| Ghi / đọc / đánh dấu đã đọc / xoá cũ 90 ngày | `db/notification.db.js`, `services/notification.service.js`, `services/retention.service.js` |
| Sự kiện tạo dòng: mở khoá khoá học (redeem, webhook, admin grant), thu hồi (refund, admin revoke), lên cấp, thành tựu, hoàn thành khoá học | `services/{commerce,admin,course,challenge}.service.js` |
| API `GET/PATCH /api/user/notifications` | `app/api/user/notifications/route.js` |
| Realtime `notification-created` trên `private-user-{id}` | `lib/realtime.js`, `components/realtime/userRealtimeBridge.jsx` |
| Chuông với badge số, trang `/notifications` (All / Unread) | `components/ui/notificationCenter.jsx`, `components/notifications/notificationsPage.jsx` |

## 2. Còn hở trong phần đã làm

Xếp theo mức đáng làm.

1. **Đường tiền không chắc có thông báo.** `notify` chạy sau khi SQL commit. Process chết giữa hai bước thì mất dòng "Course unlocked" của một đơn đã trả tiền. Sửa: ghi dòng thông báo ngay trong `public.apply_payment_event` và `public.redeem_course_points` (cùng transaction), service chỉ còn publish. Hoặc đưa qua outbox như `identity.auth_outbox`.
2. **Producer chưa có test.** Chỉ service được test. Cần test: redeem replay không ghi dòng, webhook `granted` ghi đúng course, `afterSubmission` có level-up ghi một dòng.
3. **Không gỡ được một mục.** Cột `is_deleted` có sẵn nhưng không dùng; D-04 yêu cầu trạng thái "dismissed". Thêm `PATCH { ids, dismiss: true }` và nút "Remove" trên từng mục.
4. **Trình đọc màn hình không biết có thông báo mới.** Badge đổi số im lặng. Thêm một vùng `aria-live="polite"` ẩn, đọc "N new notifications" khi số tăng.
5. **Không có chuông trong màn học** (`app/learning/[id]`) và trang admin. Người học ở màn học lâu nhất, đó cũng là nơi lên cấp.
6. **Toast không theo dark mode.** `components/shadcn/sonner.jsx` cố định `theme="light"`. Một dòng.
7. **Kind và nội dung nằm rải rác.** Bản sao chữ ở service, icon ở component. Gom vào một bảng kind dùng chung (`constants/notifications.js`: kind, nhóm, icon, màu) để admin UI và phần mở rộng sau dùng cùng một nguồn.
8. **Không đo được tỉ lệ đọc.** `has_seen` là boolean. Thêm `read_at timestamptz` (giữ `has_seen` cho index) khi làm thống kê thông báo admin ở phần 3.

Chấp nhận, không sửa: hoàn thành lại một khoá sau khi rút không báo lần hai (dedupe theo course); copy chỉ tiếng Anh (app chưa có i18n).

## 3. Thông báo từ admin đến người dùng

### 3.1 Bốn trường hợp

| | Trường hợp | Ví dụ | Kênh |
|---|---|---|---|
| A1 | Thông báo chung (broadcast) | Bảo trì, khoá học mới, sự kiện | Inbox của nhóm người nhận |
| A2 | Tin nhắn riêng cho một người | Hỗ trợ sau khi xử lý feedback, cảnh cáo | Inbox của một người |
| A3 | Thông báo tự động khi admin thao tác | Feedback đã xử lý, bình luận bị ẩn, điểm được điều chỉnh, được cấp role instructor | Inbox, qua `notify()` có sẵn |
| A4 | Banner toàn trang | Bảo trì từ 22:00 đến 23:00 | Dải trên cùng của shell, có giờ kết thúc |

A3 rẻ nhất và nên làm trước: mỗi thao tác admin đã có một chỗ audit, chỉ cần thêm một lệnh `notify` sau khi transaction commit.

| Thao tác admin | Chỗ gắn | Kind | Dedupe |
|---|---|---|---|
| Đánh dấu feedback đã xử lý | `adminFeedbackService.setFeedbackHandled` | `feedback_handled` | id feedback |
| Ẩn bình luận | `adminFeedbackService.setCommentHidden` | `content_hidden` | `comment:{id}` |
| Ẩn đánh giá khoá học | `adminRatingService.setHidden` | `content_hidden` | `rating:{course}` |
| Điều chỉnh điểm / EXP | `app/api/admin/points/adjust`, `app/api/admin/experience/adjust` | `balance_adjusted` | id giao dịch |
| Gán role | `app/api/admin/users/[id]/roles` | `role_granted` | `role:{code}` |

Lý do ẩn nội dung là ghi chú nội bộ của admin. Thông báo chỉ nói nội dung bị ẩn và dẫn tới `/help`, không chép lý do.

### 3.2 Mô hình dữ liệu (A1, A2, A4)

Bảng mới giữ bản gốc của mỗi lần gửi. Dòng trong inbox vẫn là `profile.notification` với `kind = 'announcement'` và `dedupe_key = announcement.id`.

```sql
CREATE TABLE ops.announcement (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(120) NOT NULL,
    body varchar(1000) NOT NULL,
    link text CHECK (link ~ '^/[^/\\]'),               -- chỉ đường dẫn trong site
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    channels text[] NOT NULL DEFAULT '{inbox}',        -- inbox, banner
    audience jsonb NOT NULL,                           -- xem 3.3
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'retracted')),
    send_at timestamptz,                               -- null: gửi ngay
    ends_at timestamptz,                               -- banner hết hiện
    recipients int,
    created_by bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_notification_announcement ON profile.notification (dedupe_key) WHERE kind = 'announcement';
```

Permission mới `announcement.send`, cấp cho `admin` và `super_admin`, thêm bằng migration theo mẫu `20261103_015_feedback_inbox.sql`.

**Vì sao ghi ra từng người (fan-out on write)** thay vì đọc gộp lúc mở inbox:
- Inbox đã có trạng thái đọc, đếm chưa đọc, phân trang, xoá cũ, realtime. Ghi ra từng dòng thì dùng lại hết.
- Đọc gộp phải trộn hai nguồn trong cùng một cursor và thêm bảng "đã đọc" riêng, nhiều code hơn hẳn.
- Hiện có 25 tài khoản. Ở 100 nghìn tài khoản vẫn chỉ là 100 lô `INSERT ... SELECT` một nghìn dòng.
- Unique index `(user_id, kind, dedupe_key)` sẵn có làm cho việc gửi lại sau lỗi không tạo dòng trùng.
- Người đăng ký sau lúc gửi không nhận. Đúng ý nghĩa của một thông báo. Banner (A4) đọc thẳng từ `ops.announcement` nên người mới vẫn thấy banner đang hiệu lực.

### 3.3 Nhóm người nhận

```json
{ "type": "all" }
{ "type": "role", "roles": ["student", "instructor"] }
{ "type": "course", "courseId": "<public id>" }              // đang ghi danh
{ "type": "users", "userIds": ["<public id>", "..."] }      // tối đa 100; A2 là 1 id
```

Luôn lọc thêm `identity.users.status = 'active'`. Mỗi loại là một mệnh đề `WHERE` viết sẵn trong `db/announcement.db.js`, không dựng SQL từ JSON.

### 3.4 Luồng gửi

1. Admin soạn ở `/admin/announcements/new`. Bên phải là bản xem trước dùng chính `NotificationItem`, kèm số người nhận lấy từ `GET /api/admin/announcements/preview`.
2. Bấm "Send" hoặc "Schedule". Hộp xác nhận ghi rõ "Send to 1,234 learners". Với `all`, admin phải gõ lại tiêu đề.
3. API đặt `status = scheduled` (hoặc `sending`), ghi audit `announcement.send` kèm audience và số người, rồi gửi sự kiện Inngest `announcement/send`.
4. Function `announcementSend` (đăng ký trong `jobs/index.js`):
   - `step.sleepUntil(send_at)` nếu hẹn giờ, rồi đọc lại bản ghi và dừng nếu đã `cancelled`;
   - mỗi lô một `step.run`: chọn 1.000 user id tiếp theo theo keyset, `INSERT ... ON CONFLICT DO NOTHING`;
   - xong thì `status = sent`, `recipients`, `sent_at`.
5. Realtime:
   - `audience = users`: `publishToUser` cho từng người, tối đa 100;
   - các loại khác: một sự kiện `announcement` trên kênh public mới `broadcast`, payload `{ id }`. Client nhận thì làm mới danh sách thông báo sau một khoảng trễ ngẫu nhiên 0 đến 20 giây, để vài nghìn tab không gọi API cùng lúc. Người không thuộc nhóm nhận chỉ tốn một lần tải lại không có gì mới.
6. Huỷ trước khi gửi: `cancelled`. Thu hồi sau khi gửi: `retracted`, `UPDATE profile.notification SET is_deleted = true WHERE kind = 'announcement' AND dedupe_key = $id`, rồi phát lại sự kiện `broadcast`. Cả hai đều ghi audit.

A2 (tin riêng) đi cùng đường với `audience = users` một id. Lối vào là nút "Send notification" trên `components/admin/users/userDetail.jsx`, mở hộp thoại soạn ngắn, gọi `POST /api/admin/users/[id]/notify`.

### 3.5 Banner (A4)

- `GET /api/announcements/active` với `auth: "none"`, `Cache-Control` công khai 60 giây. Trả các bản `sent` có `'banner' = ANY(channels)`, `audience.type = 'all'`, `now()` nằm giữa `send_at` và `ends_at`.
- `AnnouncementBanner` trong shell, cùng kiểu với `components/auth/verifyEmailBanner.jsx`. Màu theo `severity`.
- Ẩn banner là tiện ích riêng từng trình duyệt: lưu id đã đóng trong `localStorage`. Bản `critical` không cho đóng.
- Banner chỉ cho nhóm `all`. Banner theo nhóm cần biết người xem là ai, để sau.

### 3.6 Màn admin

- `/admin/announcements`: bảng gồm tiêu đề, trạng thái, nhóm nhận, số người nhận, tỉ lệ đã đọc, ngày gửi; thao tác huỷ / thu hồi. Theo mẫu bảng của `/admin/feedback` (docs/admin-panel-plan.md mục 5.5).
- `/admin/announcements/new`: form gồm tiêu đề, nội dung, link, mức độ, kênh, nhóm nhận, hẹn giờ, giờ kết thúc banner.
- Thêm vào sidebar admin với `permission: "announcement.send"`, và một ô "Scheduled announcements" ở dashboard.

### 3.7 Phía người học

- Thêm vào bảng kind: `announcement` (icon `LuMegaphone`), `admin_message` (`LuMessageSquare`), các kind A3. Dòng thông báo admin có nhãn nhỏ "CodeDev team".
- `severity = critical` đến lúc đang mở trang thì hiện thêm một toast.
- Trang `/notifications` có thể thêm tab "Announcements" sau, khi số lượng đủ nhiều.

### 3.8 An toàn

- Nội dung là văn bản thuần, React tự escape. Không HTML, không markdown ở bản đầu.
- `link` chỉ là đường dẫn trong site, kiểm cả ở zod lẫn `CHECK` của bảng, cùng quy tắc với `safeNextPath` (`lib/verifyLock.js`). Link ra ngoài để sau: một tài khoản admin bị chiếm có thể dùng nó để lừa đảo hàng loạt.
- Route admin mới đi qua `requirePermission(userId, ["admin.read", "announcement.send"])`, `csrf: true`, `rateLimiters.admin`, như `app/api/admin/feedback/[id]/route.js`.
- Gửi, huỷ, thu hồi đều ghi `identity.audit_log`. Sửa nội dung sau khi gửi không được phép, chỉ thu hồi rồi gửi bản mới.
- Giới hạn độ dài ở cả zod và cột.

### 3.9 Test

- `db/announcement.db.js` với PostgreSQL thật: mỗi loại audience chọn đúng người, bỏ người không active; gửi lại một lô không tạo dòng trùng; thu hồi ẩn dòng của mọi người nhận.
- Service: bản `cancelled` thì function không ghi gì; `link` ngoài site bị từ chối.
- Route: thiếu `announcement.send` trả 403.
- Component: bản xem trước khớp `NotificationItem`; banner `critical` không có nút đóng.

## 4. Hướng mở rộng sau

| Hướng | Cần gì trước | Ghi chú |
|---|---|---|
| Tuỳ chọn nhận thông báo theo nhóm | Bảng `profile.notification_preference(user_id, category, inbox, email)`, mục mới trong `components/settings/settingsPage.jsx` | Inbox cho tài khoản và tiền luôn bật |
| Email cho thông báo quan trọng, bản tóm tắt tuần | Nhà cung cấp email: outbox hiện chỉ gửi 10 thư mỗi phút (`jobs/outbox.js`). Link huỷ đăng ký | Thông báo admin `critical` có thể kèm email |
| Web push | Pusher Beams (Authenticated Users), service worker, công tắc theo thiết bị trong Settings | Thiết kế: `docs/superpowers/specs/2026-11-07-beams-web-push-design.md`. Đợt đầu push mọi dòng inbox, nhắc học dùng lại sau |
| Nhắc học, chuỗi ngày học | Cron Inngest, docs/development-plan.md 3.3 | Cần tuỳ chọn nhận trước |
| Trả lời bình luận, nhắc tên | Cột cha trên bình luận | Kind `comment_reply` |
| Cập nhật khoá đang học | Sự kiện khi admin publish bài mới | "Bài mới trong khoá X" |
| Khoá yêu thích được mở bán / giảm giá | `admin/courses/[id]/offers` | Theo danh sách yêu thích |
| Thông báo cho instructor | Role instructor có người dùng thật | Bình luận và đánh giá mới trên khoá của họ |
| Gộp thông báo cùng loại | Kind registry ở mục 2.7 | "Bạn mở 3 thành tựu" |
| Số liệu | Schema `metrics` và Grafana (admin-panel-plan mục 6) | Số thông báo theo kind, tỉ lệ đọc |
| Đa ngôn ngữ | Thư viện i18n | Lưu khoá và tham số thay vì câu đã dịch |

## 5. Thứ tự đề xuất

| Đợt | Nội dung | Ước lượng |
|---|---|---|
| 1 | Mục 2: test producer, gỡ mục, `aria-live`, toast dark mode, chuông trong màn học, kind registry | 1 ngày |
| 2 | A3: thông báo tự động từ thao tác admin | 0,5 ngày |
| 3 | A1 + A2: bảng, permission, service, function Inngest, API admin, màn admin, kind phía người học, test | 3 đến 4 ngày |
| 4 | A4: banner | 1 ngày |
| 5 | Ghi thông báo trong transaction của đường tiền (mục 2.1) | 0,5 ngày |
| 6 | Tuỳ chọn nhận, email, web push | Kế hoạch riêng. Web push: `docs/superpowers/specs/2026-11-07-beams-web-push-design.md` |

Giả định cần người quyết, mặc định đang dùng:
- `admin` và `super_admin` đều được gửi cho mọi người. Nếu muốn chỉ `super_admin` gửi nhóm `all`, thêm một kiểm tra trong service.
- `course_manager` chưa được gửi. Có thể cho gửi tới người học trong khoá họ quản lý.
- Không có link ra ngoài site.
- Có hẹn giờ ngay từ đợt 3 (Inngest `sleepUntil` có sẵn nên rẻ).
