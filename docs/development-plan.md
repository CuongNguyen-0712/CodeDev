# CodeDev — Kế hoạch phát triển tiếp theo

Cập nhật: 2026-10-15. Tài liệu này ghi lại hiện trạng sau đợt gia cố auth / Redis / Pusher và các hướng phát triển tiếp theo, xếp theo mức ưu tiên.

---

## 1. Hiện trạng sau đợt cập nhật

### Auth & session

| Thành phần | Cách hoạt động |
|---|---|
| Đọc session phía server | `lib/session.js` → `getAuthSession()` / `requireAuthSession()`. Chỉ giải mã JWT và kiểm tra session còn hiệu lực (Redis → PostgreSQL). **Không** chạy callback `jwt`, nên không rotate token ở nơi không ghi được cookie. |
| Rotate refresh token | Chỉ diễn ra trong `/api/auth/session` (SessionProvider gọi mỗi 60s). Request đồng thời dùng chung kết quả qua cache rotate trong Redis (token mới được mã hóa AES-GCM, chỉ trả cho ai chứng minh có token cũ). |
| Phát hiện token bị đánh cắp | Dùng lại một refresh token đã rotate sau 2 phút → thu hồi cả session + bắn sự kiện `session-revoked`. |
| Thu hồi từ xa | Settings → *Active sessions*: xem thiết bị, đăng xuất 1 thiết bị hoặc tất cả thiết bị khác. Thiết bị bị đăng xuất nhận Pusher ngay, hoặc chậm nhất sau lần kiểm tra 60s. |
| Lỗi session | `proxy.js` coi token có `SessionRevoked/Expired/Invalid` như chưa đăng nhập, xóa cookie và chuyển tới `/auth/error`. `SessionWatcher` luôn đăng xuất trình duyệt kể cả khi API lỗi. |
| Đăng nhập | Rate limit 10 lần/phút/IP + khóa username 15 phút sau 5 lần sai mật khẩu. Thông báo lỗi không lộ lỗi nội bộ. |
| Lỗi API / server action | `errorResponse()` và `runAction()` ẩn chi tiết lỗi 5xx (chỉ log server), trả `{ success, status, message }`. |

### Redis (`lib/cache.js`)

- Upstash (REST) hoặc ioredis (TCP), timeout 1.5s cho mỗi lệnh.
- Circuit breaker: lỗi → chuyển sang LRU trong bộ nhớ (tối đa 5.000 key), thử lại theo backoff 2s → 30s, tự khôi phục khi Redis sống lại. Đã kiểm thử bằng proxy TCP: mất kết nối → phục vụ từ memory, khôi phục sau ~1s.
- `remember()` (read-through + gộp request trùng), `acquireLock()`, sliding-window rate limit bằng Lua.
- Health check: `GET /api/health`.

### Dữ liệu đang cache

| Key | TTL | Xóa khi |
|---|---|---|
| `cache:roadmap:list` | 10 phút | hết hạn |
| `cache:course:{id}:details` (khách) | 5 phút | đăng ký / rút khỏi khóa học |
| `cache:course:list:{hash}` (khách, không tìm kiếm) | 2 phút | hết hạn |
| `cache:lesson:{sanityId}` | 1 giờ | hết hạn (xem mục 2.3) |
| `challenge:file:{objectKey}` | 1 giờ | hết hạn |
| `cache:user:{id}:v{n}:me / overview / progress:{course}` | 2–5 phút | mọi thao tác ghi của user (tăng version `user:{id}:v`) |
| `session:{id}`, `session:rotation:{id}` | theo session / 2 phút | logout, thu hồi |

### Realtime (Pusher)

| Kênh | Sự kiện |
|---|---|
| `course-{id}` (public) | `new-comment`, `comment-voted` |
| `private-user-{id}` (auth qua `/api/pusher/auth`) | `session-revoked`, `progress-updated`, `challenge-submitted`, `profile-updated` |

Client: `hooks/usePusherChannel.js` (đếm tham chiếu kênh, tự refetch khi kết nối lại), `components/realtime/userRealtimeBridge.jsx` (đồng bộ mọi tab / thiết bị).

---

## 2. Ưu tiên cao (1–2 tuần)

### 2.1 Bảo mật & cấu hình
- [ ] **Xoay vòng các API key Resend** đang nằm trong comment của `.env` (dòng `# Production:` / `# Development:`), rồi xóa các dòng đó. File không bị commit nhưng vẫn là bí mật lưu dạng rõ.
- [ ] Thêm `.env.example` liệt kê đủ biến: `REDIS_URL`, `REDIS_TOKEN`, `REDIS_COMMAND_TIMEOUT_MS`, `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*`, `REFRESH_TOKEN_HASH_SECRET`, `NEXTAUTH_*`.
- [ ] Cấu hình IP tin cậy: `RateLimiter.getClientIp` tin `x-real-ip` / `x-forwarded-for`. Nếu chạy Docker trực tiếp (không có reverse proxy ghi đè header), client có thể giả IP để né rate limit. Thêm biến `TRUSTED_PROXY` hoặc đặt Nginx/Caddy phía trước.
- [ ] Security headers (CSP, `X-Frame-Options`, `Referrer-Policy`) trong `next.config.js`.
- [ ] Idle timeout cho session (ví dụ 14 ngày không hoạt động thì hết hạn) dựa trên `identity.sessions.updated_at`.

### 2.2 Kiểm thử & CI
- [ ] Dự án chưa có test. Thêm **Vitest** cho `lib/rateLimit.js`, `lib/cache.js` (mất kết nối / khôi phục), `services/auth.service.js` (rotate, đồng thời, dùng lại token).
- [ ] **Playwright E2E**: đăng nhập / đăng xuất, thu hồi thiết bị khác, khóa tài khoản sau 5 lần sai.
- [ ] Script `npm run lint` đang gọi `next lint` (đã bị bỏ ở Next 16) và repo chưa có `eslint.config.mjs` → tạo cấu hình ESLint flat config với `eslint-config-next`.
- [ ] GitHub Actions: lint + test + build cho mỗi PR.

### 2.3 Cache & dữ liệu
- [ ] Webhook Sanity → `POST /api/revalidate` để xóa `cache:lesson:{id}` ngay khi sửa bài học (thay vì chờ 1 giờ).
- [ ] Cron dọn `identity.sessions` / `identity.refresh_tokens` đã hết hạn hoặc bị thu hồi > 30 ngày.
- [ ] Theo dõi tỉ lệ cache hit/miss (đếm trong `remember()`), log khi Redis vào trạng thái degraded.

### 2.4 Dọn dẹp
- [ ] Xóa `components/home/manage.jsx` (không còn được import; logout ở đây chưa thu hồi session phía server).
- [ ] Gom các route kiểu `app/api/get/*`, `app/api/post/*` về REST theo tài nguyên (`/api/teams`, `/api/friends`…), dùng chung `requireAuthSession` + `errorResponse`.
- [ ] `app/api/post/sendEmail` đang là stub (trả 501).

---

## 3. Tính năng sản phẩm (1–2 tháng)

### 3.1 Tài khoản
- **Xác minh email & quên mật khẩu**: đã có `@react-email/components`; dùng Resend gửi mail, token một lần lưu Redis (TTL 15 phút) + rate limit theo email.
- **Thông báo đăng nhập mới** qua email khi có session từ thiết bị lạ.
- **2FA (TOTP)** cho tài khoản dùng mật khẩu.

### 3.2 Realtime & cộng đồng
- **Trung tâm thông báo**: bảng `profile.notification` đã có → API đọc/đánh dấu đã xem + đẩy qua `private-user-{id}` (sự kiện `notification-created`), badge trên navbar.
- **Bảng xếp hạng điểm** bằng Redis sorted set (`ZINCRBY` khi được cộng điểm), theo tuần / tháng / toàn thời gian.
- **Presence trong thảo luận khóa học** (presence channel): ai đang học / đang gõ.
- Bình luận: trả lời theo luồng, sửa/xóa, báo cáo vi phạm + kiểm duyệt (`comment-deleted` realtime).
- Team / bạn bè / tin nhắn: các bảng `community.team`, `team_members`, `friend`, `messages` đã có → chat realtime 1-1 và theo team qua private channel.

### 3.3 Học tập
- **Chấm code phía server**: hiện `submitCoding` chấm dựa trên kết quả do trình duyệt báo về (`results`). Chuyển sang chạy test trong sandbox phía server (worker cô lập / Judge0 / container tạm) để kết quả và điểm không thể bị giả.
- Streak học tập, mục tiêu tuần, nhắc học (cron + email / web push — đã có `@pusher/push-notifications-web`).
- Roadmap cá nhân hóa: gợi ý khóa tiếp theo dựa trên tiến độ.

---

## 4. Nền tảng & vận hành (liên tục)

- **Hàng đợi việc nền** (BullMQ trên Redis hoặc Upstash QStash): gửi email, thông báo, chấm code, dọn dữ liệu.
- **Quan sát**: log có cấu trúc (pino), Sentry cho lỗi client/server, dashboard từ `/api/health`.
- **Docker**: thêm `healthcheck` gọi `/api/health` trong `docker-compose.yml`; Redis bật `appendonly yes` để session cache sống qua restart.
- **Hiệu năng**: ISR / cache HTTP cho trang course & roadmap công khai; đo Web Vitals.
- **Mở rộng**: khi chạy nhiều instance, Redis là bắt buộc (fallback memory chỉ đúng trong một instance: rate limit và cache rotate sẽ tách rời theo từng node).

---

## 5. Lộ trình đề xuất

| Giai đoạn | Thời gian | Nội dung |
|---|---|---|
| 1 | Tuần 1–2 | Mục 2 (bảo mật, test, CI, webhook cache, dọn dẹp) |
| 2 | Tuần 3–6 | Xác minh email + quên mật khẩu, trung tâm thông báo, bảng xếp hạng |
| 3 | Tuần 7–10 | Chấm code phía server + hàng đợi việc nền, chat team / bạn bè |
| 4 | Sau đó | 2FA, presence, streak & nhắc học, quan sát và tối ưu hiệu năng |
