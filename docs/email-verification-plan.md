# Xác minh email bằng token link & liên kết tài khoản OAuth — plan

Trạng thái: plan, chưa code. Ngày: 2026-10-22, cập nhật 2026-10-23 (thêm mục 10: sửa flow OAuth + liên kết cùng email).

## 1. Hiện trạng (đã kiểm tra codebase)

| Có sẵn | Ghi chú |
|---|---|
| `identity.users.email_verified boolean default false` | Chưa có chỗ nào set `true`. Mọi user (kể cả Google/GitHub) đang là "Not verified". |
| Badge Verified / Not verified | `components/settings/settingsPage.jsx:416`, `components/profile/profilePage.jsx:390` — chỉ hiển thị, không có hành động. |
| `/api/user/me` trả `email_verified` | `db/user.db.js:89` — banner dùng lại được, không cần API mới để đọc. |
| `@react-email/components` | Đã cài, chưa dùng. Chưa có thư viện gửi (nodemailer/resend). |
| `app/api/post/sendEmail` | Stub trả 501. Xóa khi làm xong. |
| Auth outbox (`identity.auth_outbox`, `services/authOutbox.service.js`) | Hàng đợi có retry + backoff → dùng để gửi mail. |
| `lib/auth.util.js` | `generateRefreshToken` (320 bit) + `hashRefreshToken` (HMAC-SHA256) → dùng lại cho token email. |
| `lib/rateLimit.js` | Thêm 1 limiter. |
| Prod chạy trên `code-dev-navy.vercel.app` | **Không có domain riêng** → quyết định cách gửi mail (mục 2). |

Lỗi bảo mật phát hiện khi đọc code (cần sửa cùng đợt này):

1. **Pre-account takeover qua OAuth** — `db/functions/public.auth_with_provider.sql` bước 2 tự liên kết tài khoản Google/GitHub vào user có cùng email **dù email đó chưa xác minh**. Kẻ tấn công đăng ký bằng mật khẩu với email nạn nhân → nạn nhân sau đó "Sign in with Google" → vào đúng tài khoản kẻ tấn công đang giữ mật khẩu.
2. **Đổi email không cần xác minh** — `userDb.updateProfile` ghi thẳng `identity.users.email`, không reset `email_verified`.

Các lỗi khác của flow OAuth: xem mục 10.1.

## 2. Gửi email: cá nhân hay doanh nghiệp?

Điểm nghẽn thật là **domain**, không phải gói dùng thử. Resend/SES/Postmark/Mailtrap đều yêu cầu xác minh domain (DNS SPF/DKIM) mới gửi được cho người lạ; `vercel.app` không phải domain của mình nên không xác minh được. Resend có gói free vĩnh viễn (≈3.000 mail/tháng, 100/ngày, 1 domain), không cần trial 14 ngày.

| Phương án | Cần domain | Chi phí | Giới hạn | Deliverability | Dùng khi |
|---|---|---|---|---|---|
| **A. Gmail SMTP + App Password** (tài khoản Gmail riêng cho app, vd `codedev.noreply@gmail.com`) | Không | 0 | ~500 người nhận/24h | Tốt (Google tự ký DKIM cho gmail.com) | **Bây giờ**: đồ án, demo, < vài trăm user |
| B. Brevo/SendGrid với sender là địa chỉ Gmail | Không | 0 | 300/ngày | Kém: From `@gmail.com` gửi qua server khác → lệch DMARC → vào spam | Không nên |
| **C. Domain riêng + Resend** | Có (~10–12 USD/năm cho .com; .id.vn miễn phí cho 18–23 tuổi đã hết hạn 31/12/2025, kiểm tra lại có gia hạn không) | 0 cho Resend free | 100/ngày, 3.000/tháng | Tốt nhất, From `noreply@domain` | Khi public thật / cần chuyên nghiệp |

**Khuyến nghị:** làm theo A ngay, thiết kế để chuyển sang C chỉ bằng đổi env. Cách đó: gửi qua **SMTP bằng nodemailer** cho cả hai — Resend cũng có SMTP (`smtp.resend.com:465`, user `resend`, pass = API key). Không viết adapter riêng cho từng provider.

Rủi ro phương án A: Google có thể chặn đăng nhập SMTP từ IP lạ (Vercel đổi IP liên tục). Test gửi thật trên prod sớm; nếu bị chặn thì chuyển C.

Dev: thêm **Mailpit** vào `compose.yml` profile `dev` (SMTP `1025`, web UI `8025`) — không gửi mail thật khi dev/test.

Env mới:

| Biến | Dev | Prod (A, hiện tại) | Prod (C) |
|---|---|---|---|
| `MAIL_FROM` | `CodeDev <dev@codedev.local>` | địa chỉ Gmail gửi đi | `CodeDev <noreply@<domain>>` |
| `MAIL_PASSWORD` | trống → Mailpit `127.0.0.1:1025` | App Password của Gmail đó → `smtp.gmail.com:465` | API key Resend |
| `MAIL_HOST` / `MAIL_PORT` | không đặt | không đặt | `smtp.resend.com` / `465` |
| `EMAIL_VERIFY_TTL_SECONDS` | 86400 | 86400 | 86400 |

Cấu hình nằm ở `lib/mailConfig.mjs`. Link trong mail dựng từ `NEXTAUTH_URL`. Production thiếu `MAIL_FROM` / `MAIL_PASSWORD` → không gửi, outbox thử lại, log lỗi lúc khởi động (`lib/envCheck.mjs`). Kiểm một file env: `npm run mail:test -- --env <file> --to <địa chỉ>`.

## 3. Thiết kế dữ liệu

Migration `db/migrations/20261023_002_email_verification.sql` (additive):

```sql
CREATE TABLE identity.email_tokens (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  purpose     text   NOT NULL CHECK (purpose IN ('verify_email')),  -- sau thêm 'reset_password'
  email       varchar(255) NOT NULL,   -- email tại lúc cấp; đổi email => token cũ vô hiệu
  token_hash  text   NOT NULL UNIQUE,  -- HMAC-SHA256, không lưu token thô
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Mỗi user chỉ một token còn sống cho mỗi mục đích.
CREATE UNIQUE INDEX email_tokens_live_uq ON identity.email_tokens (user_id, purpose) WHERE consumed_at IS NULL;

```

Backfill `email_verified` cho user OAuth đã chuyển sang migration của bước 0 (mục 10.7), vì hotfix OAuth cần nó.

Cùng migration: sửa `auth_with_provider` (mục 4E). `sessionDb.cleanup` thêm xóa token hết hạn > 7 ngày.

Token: 320 bit ngẫu nhiên base64url (dùng `generateRefreshToken`), lưu `hashRefreshToken("email-verify|" + token)` để tách miền với refresh token.

## 4. Luồng

### A. Đăng ký bằng mật khẩu

```
POST /api/user/signup
  -> sign_up()                                   (như cũ)
  -> enqueue outbox "email.verify_requested" { userId }
  -> processAuthOutbox({ ids: [outboxId] })      (gửi ngay, lỗi thì worker/cron retry)
  <- 201 { ..., verificationSent: true }
UI: "Account created. We sent a verification link to c***@gmail.com. You can sign in now."
```

Handler outbox `email.verify_requested`: xóa token sống cũ → cấp token mới (TTL 24h) → render template → gửi SMTP. Payload chỉ có `userId`, **không chứa token thô**; retry thì cấp token mới. Vẫn cho đăng nhập khi chưa xác minh (soft gate, mục 5).

Lưu ý Vercel: không có `vercel.json` cron → worker in-process không chạy đều trên serverless. Retry thực tế dựa vào nút "Resend" của user, hoặc cấu hình scheduler gọi `POST /api/internal/auth-outbox` (`AUTH_CRON_SECRET`).

### B. Bấm link

```
Mail: {NEXTAUTH_URL}/auth/verify-email?token=XXX
Trang /auth/verify-email (client):
  1. đọc token, history.replaceState() xóa token khỏi URL
  2. POST /api/auth/verify-email { token }
Server, 1 transaction:
  SELECT ... FROM identity.email_tokens WHERE token_hash = $h AND purpose = 'verify_email' FOR UPDATE
  - không có             -> 400 TOKEN_INVALID
  - consumed + user đã verified -> 200 { status: "already_verified" }
  - hết hạn              -> 410 TOKEN_EXPIRED
  - token.email <> users.email -> 400 TOKEN_INVALID (email đã đổi)
  - ok -> users.email_verified = true; token.consumed_at = now() -> 200 { status: "verified" }
  sau commit: publishToUser(userId, "email-verified") để các tab đang mở ẩn banner
```

- Không xác minh bằng GET: trình quét link (Outlook Safe Links, antivirus) mở link trước user. POST từ JS + kết quả idempotent nên user vẫn thấy "Verified".
- Trang này gửi `Referrer-Policy: no-referrer`, không log token.
- Không cần đăng nhập: bấm link trên điện thoại khác vẫn được.

### C. Gửi lại

`POST /api/auth/verify-email/resend` — cần đăng nhập, cùng origin. Limiter mới `emailVerify`: 3 lần / 15 phút / user, UI cooldown 60 s. Đã verified → 200 `{ status: "already_verified" }`, không gửi.

### D. Đổi email (Settings)

`updateProfile`: khi email đổi thì cùng câu lệnh set `email_verified = false`, sau đó enqueue `email.verify_requested` tới email mới. Token cũ chết tự nhiên vì lệch `email`. Toast: "Email updated. Check the new address to verify it."

(Đợt sau, cùng lúc làm quên mật khẩu: `pending_email` — giữ email cũ đến khi email mới xác minh xong, và báo cho email cũ.)

### E. OAuth (Google/GitHub)

Thiết kế đầy đủ ở mục 10. Tóm tắt: chỉ tin email provider đã xác minh; chỉ tự liên kết khi tài khoản có sẵn cũng đã xác minh email; còn lại phải chứng minh sở hữu (mật khẩu hoặc link qua email).

## 5. Chính sách chặn (soft gate)

| Hành động | Chưa xác minh |
|---|---|
| Học, làm challenge, xem roadmap, profile, ranking | Cho phép |
| Bình luận | Cho phép (siết sau nếu có spam) |
| `POST /api/commerce/checkout`, `POST /api/commerce/redeem` | **Chặn ở server**: `403 { code: "EMAIL_NOT_VERIFIED" }` |

User cũ đang dùng mật khẩu không bị khóa, chỉ thấy banner.

## 6. Thiết kế thông báo

Copy theo ngôn ngữ UI hiện tại (tiếng Anh). Màu brand violet `#7C3AED`; banner dùng tông warning của `components/ui/alert.jsx`.

**1. Banner toàn app** — `components/auth/verifyEmailBanner.jsx`, đặt dưới navbar, chỉ hiện khi đã đăng nhập và `email_verified === false`, không hiện trên `/auth/*`.

```
[!] Verify your email to secure your account and unlock purchases.
    We sent a link to c***@gmail.com.          [Resend email]  [Change email]  [x]
```

- `Resend email`: idle → "Sending..." → "Sent. Check your inbox and spam folder." + đếm ngược 60 s; lỗi 429 → "Too many requests. Try again in N minutes."
- `Change email` → `/settings` (khu Account).
- `x`: ẩn trong phiên trình duyệt (sessionStorage, bọc try/catch), phiên sau hiện lại.
- `role="status"` (không phải `alert`: không khẩn cấp); nút cao ≥ 40 px; mobile: chữ một dòng, 2 nút xuống hàng.
- Nghe sự kiện realtime `email-verified` → ẩn ngay.

**2. Settings → Account** — cạnh badge "Not verified" thêm nút nhỏ `Send verification email` (cùng API resend).

**3. Sau đăng ký** — thay alert hiện tại ("Account created successfully! Please sign in.") bằng: "Account created. We sent a verification link to c***@gmail.com. Sign in to continue."

**4. Khi bị chặn (403 `EMAIL_NOT_VERIFIED`)** — dialog ở checkout: tiêu đề "Verify your email first", nội dung "Purchases need a verified email so we can send receipts and recover your account.", nút `Resend email` / `Cancel`.

**5. Trang `/auth/verify-email`** — 5 trạng thái:

| Trạng thái | Tiêu đề | Hành động |
|---|---|---|
| verifying | "Verifying your email..." | spinner, `aria-busy` |
| verified | "Email verified" | `Continue learning` → `/home` (hoặc `Sign in` nếu chưa đăng nhập) |
| already_verified | "Your email is already verified" | như trên |
| expired | "This link has expired" | `Send a new link` (đã đăng nhập) / `Sign in to get a new link` |
| invalid | "This link is not valid" | như expired |

**6. Email** — `emails/verifyEmail.jsx` (react-email), có bản plain-text.

```
Subject:   Verify your email for CodeDev
Preheader: Confirm c***@gmail.com to finish setting up your account.

Hi {name},
Confirm this is your email address for CodeDev.
            [ Verify email ]
Or paste this link into your browser: {url}
This link expires in 24 hours. If you did not create a CodeDev account, ignore this email.
```

Che email trong UI: giữ ký tự đầu + domain (`c***@gmail.com`).

## 7. File thay đổi

| File | Việc |
|---|---|
| `db/migrations/20261023_002_email_verification.sql` | bảng `email_tokens` |
| `db/emailToken.db.js` | issue / consume trong transaction |
| `lib/mail.js` | nodemailer transport từ env + `sendMail` |
| `emails/verifyEmail.jsx` | template |
| `services/emailVerification.service.js` | `request(userId)`, `verify(token)` |
| `services/authOutbox.service.js` | handler `email.verify_requested` |
| `app/api/auth/verify-email/route.js`, `.../resend/route.js` | 2 endpoint |
| `app/auth/verify-email/page.jsx` | trang kết quả |
| `components/auth/verifyEmailBanner.jsx` + chỗ gắn dưới navbar | banner |
| `app/api/user/signup/route.js`, `components/auth/signup.jsx` | enqueue + đổi copy |
| `db/user.db.js` (`updateProfile`), `components/settings/settingsPage.jsx` | reset cờ khi đổi email, nút gửi |
| `app/api/auth/[...nextauth]/route.js` | truyền cờ verified của provider |
| `app/api/commerce/checkout`, `.../redeem` | gate 403 |
| `lib/rateLimit.js` | limiter `emailVerify` |
| `compose.yml` | Mailpit (profile `dev`) |
| `package.json` | thêm `nodemailer` |
| `docs/auth.md`, `docs/environments.md` | luồng + env mới |
| `app/api/post/sendEmail` | xóa stub |

## 8. Test

- Service (DB test): cấp token thay token cũ; verify thành công; dùng lại → `already_verified`; hết hạn → 410; đổi email rồi dùng token cũ → invalid; 2 request đồng thời chỉ 1 consume.
- Route: resend bị rate limit; chưa đăng nhập → 401; checkout chưa verified → 403.
- OAuth: user mật khẩu chưa verified + Google cùng email → từ chối liên kết; đã verified → liên kết.
- Mail: test dùng Mailpit hoặc mock `lib/mail.js`, kiểm link chứa token và không log token.

## 9. Thứ tự triển khai

Trạng thái 2026-10-23: bước 0–6 đã làm và test trên local (Mailpit, trình duyệt; GitHub/Google thật chưa thử). Chưa làm: bước 7–8 (prod). Sau review bảo mật của bước 5–6:
- 5b chỉ cấp và chỉ nhận token khi email tài khoản chưa xác minh và vẫn bằng email provider; xác nhận xóa **mọi** cách đăng nhập khác (không chỉ mật khẩu), vì GitHub/Google gắn vào lúc email chưa xác minh có thể là của kẻ tấn công. Trang `/auth/link/confirm` cần bấm nút, không tự gửi khi mở trang.
- "Connect" chỉ liên kết khi request callback còn mang đúng session (`sid`) đã bấm Connect; intent cũ bị bỏ, đăng nhập bình thường.
- Mỗi user một tài khoản mỗi provider (migration `20261023_004`).
- Đổi email dùng chung hạn mức `emailVerify` (3 mail / 15 phút).
- Lỗi liên kết trên `/auth/link` trả URL tuyệt đối (next-auth `redirect: false` gọi `new URL()` không có base).
Khác plan:
- template ở `components/templates/verifyEmailTemplate.jsx` (folder có sẵn), không phải `emails/`;
- checkout bị chặn chỉ hiện thông báo lỗi của API (banner đã có nút gửi lại), chưa có dialog riêng;
- `resend` luôn trả "sent", kể cả khi email đã xác minh (khi đó không gửi gì);
- realtime dùng lại sự kiện `profile-updated` thay vì thêm `email-verified`.
Cũng đã sửa theo review: phiên của user bị khóa không refresh được nữa; tag AES-GCM phải đủ 16 byte; link thất bại trên `/auth/link` không còn tạo session mồ côi và hiện đúng lỗi.

Lỗi chiếm tài khoản qua OAuth đang có trên prod, nên sửa trước (bước 0). Bước 0 không cần gửi mail.

0. **Hotfix OAuth** (mục 10, phần không cần mail): checklist ở 10.11.
1. Migration + db + service + test xác minh email (chưa đụng UI).
2. `lib/mail.js` + Mailpit + template + handler outbox.
3. API verify/resend + trang `/auth/verify-email`.
4. Banner, Settings, copy sau đăng ký, dialog checkout.
5. Đổi email (4D) + phần OAuth cần mail: xác nhận liên kết qua email (10.3 trường hợp 5b), mail báo đã liên kết/gỡ liên kết.
6. Settings → "Sign-in methods": kết nối / gỡ GitHub, Google (10.4, 10.5).
7. Prod: tạo Gmail riêng, bật 2FA, tạo App Password, set env trên Vercel, apply migration, gửi thử 1 mail thật.
8. Khi có domain: thêm domain vào Resend + DNS (SPF, DKIM, DMARC), đặt `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`, `MAIL_PASSWORD`. Không đổi code.

Đợt sau (dùng lại `email_tokens`): quên mật khẩu (`purpose = 'reset_password'`, TTL 15 phút), đặt mật khẩu cho tài khoản chỉ có OAuth, `pending_email`, mail báo đăng nhập thiết bị lạ.

## 10. OAuth: sửa lỗi và liên kết tài khoản cùng email

### 10.0 Kết quả rà soát (2026-10-23)

**Dữ liệu prod** (Neon `application`, branch `production`, DB `verceldb`; chỉ chạy `SELECT` đếm, không đọc email):

| Chỉ số | Giá trị | Kết luận |
|---|---|---|
| users | 14 | |
| `email_verified = true` | 0 | Đúng như phân tích: chưa chỗ nào set `true` |
| accounts: credentials / github / google | 8 / 3 / 3 | |
| User có cả mật khẩu và OAuth, OAuth liên kết sau (liên kết tự động theo email) | **0** | Lỗi 1 chưa bị khai thác; backfill an toàn |
| User có cả GitHub và Google | 0 | |
| Email chưa chuẩn hóa / trùng khi so chữ thường | 0 / 0 | Tạo unique index `lower(email)` được ngay |
| Username sai định dạng `^[a-z0-9_]{3,30}$` | 5 (2 GitHub, 3 Google) | Xác nhận lỗi 4: có khoảng trắng, chữ hoa, dấu |
| `status <> 'active'` | 0 | |
| credentials không có `password_hash` | 0 | |

**Đối chiếu với source next-auth 4.24** (`node_modules/next-auth`):

- Không có adapter thì object `user` truyền vào callback `signIn` chính là object truyền vào `jwt` (`core/routes/callback.js:66-125`, `core/lib/callback-handler.js:27`). Gắn kết quả vào `user` trong `signIn` thì `jwt` đọc được.
- `signIn` trả chuỗi → chuyển hướng tới chuỗi đó; ném lỗi → `/api/auth/error?error=<message>` rồi sang `pages.error`. Plan dùng cách trả chuỗi `/auth/error?error=<Mã>`.
- Provider GitHub (`providers/github.js:27-36`): chỉ gọi `/user/emails` khi không có email public, chọn `primary` (hoặc email đầu tiên), **không xem `verified`**. Xác nhận lỗi 2.
- Credentials: `authorize` → `signIn` → `jwt`, cùng thứ tự với OAuth.

**Sửa so với bản plan trước:**

1. Backfill `email_verified` cho user OAuth chuyển vào bước 0. Nếu không, user chỉ có GitHub thêm Google cùng email sẽ rơi vào trường hợp 5, mà không có mật khẩu để làm 5a.
2. 5b: xóa hẳn dòng `credentials` trong `identity.accounts` thay vì đặt `password_hash = NULL`. `log_in` join dòng đó rồi gọi `bcrypt.compare` với hash rỗng.
3. 5a: chỉ liên kết khi form trên `/auth/link` gửi thêm cờ `link=1`, không liên kết chỉ vì còn cookie `cd_link`.
4. 10.4: không tạo session mới, không thu hồi session cũ. Thu hồi sẽ phát `session-revoked`, và các tab khác còn giữ `sid` cũ sẽ tự đăng xuất (`components/realtime/userRealtimeBridge.jsx:43`). Lệnh đăng xuất đó xóa luôn cookie mới.
5. Thêm lỗi 9: không đường đăng nhập nào kiểm `users.status`.
6. Không đổi 5 username cũ. Trang profile dùng `public_id` (`app/profile/[id]`), nên username sai định dạng chỉ xấu, không làm hỏng link. Quy tắc mới chỉ áp cho user mới.

### 10.1 Lỗi trong flow hiện tại

Code: `app/api/auth/[...nextauth]/route.js` (callback `jwt`), `services/auth.service.js → signUpWithProvider`, `db/functions/public.auth_with_provider.sql`.

| # | Lỗi | Hậu quả | Mức |
|---|---|---|---|
| 1 | Bước 2 của `auth_with_provider` liên kết theo email, không kiểm `users.email_verified` | Chiếm tài khoản trước (pre-account takeover), mô tả ở mục 1 | Nghiêm trọng |
| 2 | Không kiểm email provider đã xác minh. next-auth v4 lấy email public, hoặc primary từ `/user/emails` của GitHub, không xem `verified`. Google: bỏ qua `email_verified` | Email chưa xác minh ở provider vẫn được tin và được dùng để liên kết | Cao |
| 3 | Email OAuth không chuẩn hóa. Signup gọi `toLowerCase()`, OAuth thì không, và cột `users.email UNIQUE` phân biệt hoa thường | `John@Gmail.com` và `john@gmail.com` thành 2 user của cùng một người; bước liên kết theo email không khớp | Trung bình |
| 4 | `username = user.username \|\| user.name`. Với GitHub/Google, `user.name` là tên hiển thị ("Nguyen Van A", có khoảng trắng, có dấu), insert thẳng vào `users.username UNIQUE` | Người thứ hai trùng tên hiển thị không đăng nhập được ("Authentication failed, try again"); username sai định dạng | Cao |
| 5 | Mọi quyết định nằm trong callback `jwt`, lỗi bị gói thành `Error("Authentication failed")` | Người dùng chỉ thấy `/auth/error?error=Callback` chung chung; không chuyển hướng được sang trang liên kết | Trung bình |
| 6 | Liên kết không báo cho chủ tài khoản, không ghi audit `account.linked` | Bị liên kết lạ cũng không biết | Trung bình |
| 7 | Không có chỗ xem hoặc gỡ GitHub/Google đã liên kết | Không tự khắc phục được | Thấp |
| 8 | `profile.info.surname = name = username` cho user OAuth | Tên hiển thị sai | Thấp |
| 9 | `log_in` và `auth_with_provider` không kiểm `users.status` | User `blocked`/`inactive` vẫn đăng nhập được. Prod hiện chưa có user nào như vậy và chưa có chức năng khóa user | Thấp |

### 10.2 Mô hình

- `identity.users.email` là email chính: dùng để đăng nhập, khôi phục tài khoản và nhận thông báo. Lưu dạng `lower(trim())`.
- `identity.accounts` lưu các cách đăng nhập: `credentials` (`password_hash`), `github`, `google`. Thêm cột `provider_email` (email provider báo lúc liên kết) để hiển thị và audit.
- Một user có nhiều account. Mỗi cặp `(provider, provider_account_id)` thuộc đúng 1 user (đã có unique index `account_provider_pkey`).
- **Email đã xác minh của provider** (`providerEmail`):
  - Google: `profile.email` khi `profile.email_verified === true`.
  - GitHub: gọi `GET https://api.github.com/user/emails` bằng `account.access_token` (đã có scope `user:email`). Lấy email `primary && verified`; không có thì lấy email `verified` đầu tiên; không có email nào thì là `null`.

### 10.3 Quy tắc khi đăng nhập bằng GitHub/Google

Quyết định nằm trong callback `signIn`. Callback này được trả về URL để chuyển hướng, nên sửa được lỗi 5. Gọi `authService.signInWithProvider()`, hàm này trả `{ user }` hoặc `{ redirect }`. Callback `jwt` chỉ còn gọi `startSession(token, user)`.

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | `(provider, id)` đã liên kết với user U | Đăng nhập U. Email provider khác email của U thì vẫn không đổi gì. |
| 2 | Chưa liên kết, `providerEmail = null` | Từ chối: `/auth/error?error=OAuthEmailUnverified` |
| 3 | Chưa liên kết, không user nào có email E | Tạo user mới: `email_verified = true`, sinh username theo 10.6 |
| 4 | Chưa liên kết, user U có E và **U đã xác minh email** | Tự liên kết, đăng nhập U, gửi mail "GitHub was connected", ghi audit `account.linked` |
| 5 | Chưa liên kết, user U có E nhưng **U chưa xác minh email** | Không đăng nhập. Lưu yêu cầu liên kết vào cookie, chuyển sang `/auth/link` để người dùng xác nhận là chủ tài khoản (bên dưới) |
| 6 | Đang đăng nhập, bấm "Connect" trong Settings (10.4) | Liên kết vào user hiện tại, email khác nhau vẫn được. `(provider, id)` đã thuộc user khác → `error=OAuthAccountInUse` |

Vì sao trường hợp 4 được tự liên kết: cả hai bên đều đã chứng minh sở hữu E, và sở hữu email vốn đã là cách khôi phục tài khoản (quên mật khẩu). Muốn chặt hơn thì xử lý trường hợp 4 như 5a.

**Trường hợp 5, trang `/auth/link`.** Yêu cầu liên kết lưu trong cookie `cd_link`: HttpOnly, SameSite=Lax, sống 10 phút. Nội dung `{ provider, providerAccountId, providerEmail, image, targetUserId }` được mã hóa AES-GCM, dùng chung cách niêm phong với `sealRecovery` trong `lib/auth.util.js`. Không cần bảng mới.

- **5a. Xác nhận bằng mật khẩu (bước 0, không cần mail):** trang hiện form đăng nhập mật khẩu của U, dùng lại `CredentialsProvider`, gửi thêm field `link: "1"`. Trong callback `signIn` nhánh credentials: chỉ khi có `credentials.link === "1"`, `cd_link` hợp lệ và `targetUserId` đúng là user vừa đăng nhập thì liên kết provider, đặt `email_verified = true` (provider đã chứng minh email, mật khẩu đã chứng minh tài khoản), xóa cookie, ghi audit. Sai mật khẩu thì bị `failureGuards.login` khóa như đăng nhập thường.
- **5b. "Don't know this password?" → xác nhận qua email (bước 5, cần mail):** gửi token `purpose = 'link_account'` tới E (rate limit dùng chung `emailVerify`). Thông tin liên kết nằm trong cột mới `email_tokens.payload jsonb`, TTL 30 phút. Bấm link → `POST /api/auth/link/confirm`, trong một transaction: liên kết provider, `email_verified = true`, **thu hồi mọi session của U và xóa dòng `credentials` của U trong `identity.accounts`**. Mật khẩu đó do người chưa chứng minh email đặt, có thể là kẻ tấn công. Sau đó người dùng đăng nhập bằng provider (trường hợp 1). Muốn có lại mật khẩu thì dùng "quên mật khẩu" ở đợt sau.
- Trước khi có mail (bước 0 → 4), nút 5b thay bằng dòng: "Don't know this password? Contact us through the Help page."
- Nút `Cancel`: xóa `cd_link`, quay về `/auth`.

**Kiểm tra ngược lại:** đăng ký bằng mật khẩu với email đã thuộc user OAuth vẫn bị từ chối như hiện tại ("Email has been used"). Không thêm gì.

### 10.4 Kết nối từ Settings (trường hợp 6)

next-auth v4 dùng JWT, không có adapter, nên không tự liên kết được. Cách làm:

1. `POST /api/auth/link/start { provider }` (cần đăng nhập, cùng origin) đặt cookie `cd_link_intent` đã niêm phong `{ userId, sessionId }`, sống 10 phút.
2. Client gọi `signIn(provider, { callbackUrl: "/settings?linked=<provider>" })`.
3. Callback `signIn`: có `cd_link_intent` hợp lệ và session đó còn sống → liên kết vào `userId` (bỏ qua so khớp email). Xóa cookie, ghi audit, gửi mail báo.
4. Callback `jwt` **giữ nguyên session cũ**: dựng lại claims cho `sessionId` trong intent (như `startSession` nhưng không tạo session, không đặt refresh cookie mới; refresh cookie cũ vẫn đúng). Không thu hồi gì, nên không phát `session-revoked` làm các tab khác đăng xuất.

### 10.5 Gỡ liên kết

`DELETE /api/user/accounts/[provider]` (cần đăng nhập, rate limit `profile`). Từ chối nếu đó là cách đăng nhập cuối cùng, tức là không còn `credentials` có `password_hash` và không còn provider nào khác: `409 LAST_SIGN_IN_METHOD`. Sau khi gỡ: ghi audit `account.unlinked`, gửi mail báo.

### 10.6 Sinh username và tên hiển thị

- Gốc username: GitHub dùng `profile.login`, Google dùng phần trước `@` của email.
- Chuẩn hóa: bỏ dấu, chuyển chữ thường, chỉ giữ `[a-z0-9_]`, dài 3–30 ký tự; thiếu ký tự thì thêm `user`.
- Trùng thì thêm `_` + 4 số ngẫu nhiên, thử tối đa 5 lần trong hàm SQL (vòng lặp, bắt `unique_violation`).
- Tên hiển thị: Google dùng `given_name` / `family_name` cho `name` / `surname`. GitHub tách `profile.name` theo khoảng trắng cuối; không có thì dùng `login`.
- Chỉ áp cho user mới. 5 username cũ sai định dạng giữ nguyên (10.0).

### 10.7 Dữ liệu và migration

Bước 0 — `db/migrations/20261023_001_oauth_account_linking.sql` (additive, chạy trước migration xác minh email):

```sql
-- 1. Chuẩn hóa email. Prod 2026-10-23: 0 dòng cần sửa, 0 trùng.
UPDATE identity.users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
CREATE UNIQUE INDEX users_email_lower_uq ON identity.users (lower(email));

-- 2. Email provider báo lúc liên kết.
ALTER TABLE identity.accounts ADD COLUMN provider_email varchar(255);

-- 3. Backfill: user đã liên kết Google/GitHub coi như đã xác minh email.
--    Prod 2026-10-23: 0 liên kết tự động sau mật khẩu, nên an toàn (query kiểm tra bên dưới).
UPDATE identity.users u SET email_verified = true
WHERE EXISTS (SELECT 1 FROM identity.accounts a WHERE a.user_id = u.id AND a.provider IN ('google', 'github'));

-- 4. auth_with_provider trả quyết định thay vì luôn liên kết (DROP bản 7 tham số rồi CREATE bản mới):
--    auth_with_provider(_id, _public_id, _username, _email, _image, _provider, _provider_account_id,
--                       _surname, _name)   -- _email: email đã xác minh, đã lower()
--      -> result: 'login' | 'created' | 'linked' | 'link_required' | 'blocked'
--         + các cột user như cũ khi result in ('login','created','linked')
--      - tìm theo lower(email); chỉ link khi users.email_verified; username trùng thì thêm hậu tố (10.6)
--      - status <> 'active' -> 'blocked'
--    link_provider_account(_user_public_id, _provider, _provider_account_id, _provider_email)
--      -> dùng cho 5a, 5b, Settings; (provider, id) thuộc user khác -> RAISE 'account_in_use'

-- 5. log_in: thêm AND u.status = 'active'.
```

Sau đó chạy `db/tools/export-schema.mjs` để cập nhật `db/functions/*.sql` và `db/schema.dbml`.

Bước 5 — thêm vào migration xác minh email hoặc migration riêng (cần bảng `email_tokens`):

```sql
ALTER TABLE identity.email_tokens ADD COLUMN payload jsonb;
ALTER TABLE identity.email_tokens DROP CONSTRAINT email_tokens_purpose_check,
  ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify_email', 'link_account'));
```

**Kiểm tra lại ngay trước khi deploy** (dữ liệu có thể đổi từ ngày rà soát). Lỗi số 1 có thể đã gắn Google/GitHub của nạn nhân vào tài khoản mật khẩu của kẻ tấn công, và backfill sẽ đánh dấu tài khoản đó đã xác minh. Liệt kê user có cả `credentials` lẫn OAuth, mà account OAuth được tạo sau account `credentials`. Ngày 2026-10-23 query này trả 0 dòng:

```sql
SELECT u.username, u.email, c.created_at AS password_at, o.provider, o.created_at AS linked_at
FROM identity.users u
JOIN identity.accounts c ON c.user_id = u.id AND c.provider = 'credentials'
JOIN identity.accounts o ON o.user_id = u.id AND o.provider IN ('github', 'google')
WHERE o.created_at > c.created_at;
```

Mỗi dòng là một liên kết tự động theo email. Có dòng thì xem tay trước khi chạy backfill; dòng nào đáng ngờ thì thu hồi session và xóa dòng `credentials` như 5b.

### 10.8 Giao diện

Copy tiếng Anh theo UI hiện tại.

**Trang `/auth/link` (trường hợp 5):**

```
Link your GitHub account

An account for c***@gmail.com already exists (@username).
Sign in with its password to link GitHub. You only need to do this once.

  Username  [ username      ]   (điền sẵn, khóa)
  Password  [ ************* ]
            [ Sign in and link ]

Don't know this password? Email me a link instead
                                              Cancel
```

- Sau "Email me a link instead": "Check c***@gmail.com. The link expires in 30 minutes."
- `cd_link` hết hạn: "This link request expired. Sign in with GitHub again."

**Settings → mục mới "Sign-in methods":**

```
Sign-in methods
Password   Set                                    [Change password]   (đợt sau)
GitHub     Connected as @octocat · john@x.com     [Disconnect]
Google     Not connected                          [Connect]
```

- `Disconnect` bị khóa khi đó là cách đăng nhập cuối, kèm dòng mô tả: "Add another sign-in method before disconnecting this one."
- Sau khi kết nối (`?linked=github`): toast "GitHub connected."
- Lỗi `OAuthAccountInUse`: toast "This GitHub account is already linked to another CodeDev account."

**Mã lỗi mới trong `components/auth/errorPage.jsx`:**

| Mã | Tiêu đề | Gợi ý |
|---|---|---|
| `OAuthEmailUnverified` | "Your GitHub email isn't verified" | "Verify an email in your GitHub settings (Emails), then try again." |
| `OAuthAccountInUse` | "This account is already linked" | "Sign in with the CodeDev account it belongs to, or disconnect it there first." |
| `LinkExpired` | "Link request expired" | "Start again by signing in with GitHub or Google." |

**Mail báo** (template react-email chung, 2 mẫu):
- "GitHub was connected to your CodeDev account" — kèm thời gian, IP, thiết bị, và câu "Not you? Sign in and disconnect it in Settings, then change your password."
- "GitHub was disconnected from your CodeDev account".

### 10.9 File thay đổi

| File | Việc |
|---|---|
| `db/migrations/20261023_001_oauth_account_linking.sql` | mục 10.7 |
| `app/api/auth/[...nextauth]/route.js` | thêm callback `signIn`; `jwt` chỉ tạo session; nhánh credentials xử lý `cd_link` |
| `services/auth.service.js` | `signInWithProvider` (lấy email đã xác minh, chuẩn hóa, quyết định), `linkProviderAccount` |
| `lib/oauthEmail.js` | lấy email đã xác minh của GitHub (`/user/emails`) và Google (`email_verified`) |
| `lib/authCookies.js` | đặt / đọc / xóa `cd_link`, `cd_link_intent` |
| `db/user.db.js` | gọi hàm SQL mới; tìm user theo `lower(email)` |
| `app/auth/link/page.jsx`, `components/auth/linkAccount.jsx` | trang 5a/5b |
| `app/api/auth/link/start`, `.../email`, `.../confirm` | Settings (10.4), gửi mail 5b, xác nhận 5b |
| `app/api/user/accounts/[provider]/route.js` | `GET` danh sách, `DELETE` gỡ |
| `components/settings/settingsPage.jsx` | mục "Sign-in methods" |
| `components/auth/errorPage.jsx` | 3 mã lỗi mới |
| `lib/authAudit.js` (chỉ dùng) | `account.linked`, `account.link_required`, `account.unlinked` |
| `docs/auth.md` | mô tả flow mới |

### 10.10 Test

- Bảng quyết định 10.3: mỗi trường hợp 1–6 có ít nhất 1 test. Trường hợp 5 kiểm cả việc **không** tạo session.
- GitHub `/user/emails`: chỉ có email chưa xác minh → `OAuthEmailUnverified`; primary chưa xác minh nhưng email phụ đã xác minh → dùng email phụ.
- Email `John@Gmail.com` qua OAuth khớp user `john@gmail.com`.
- Username: hai người cùng tên hiển thị "Nguyen Van A" đều đăng nhập được, username khác nhau và đúng định dạng.
- 5a: sai mật khẩu bị khóa sau 5 lần; `cd_link` của user A không liên kết được vào user B.
- 5b: sau khi xác nhận thì session cũ bị thu hồi, `password_hash` bị xóa, token dùng lại bị từ chối.
- Gỡ liên kết cách đăng nhập cuối → 409.
- `cd_link_intent` của session đã thu hồi → không liên kết.
- 5a: đăng nhập mật khẩu bình thường (không có `link=1`) khi còn `cd_link` → không liên kết.
- Kết nối từ Settings: `sid` không đổi, không có sự kiện `session-revoked`.
- User `status = 'blocked'` → cả mật khẩu và OAuth đều bị từ chối.

### 10.11 Checklist bước 0 (hotfix OAuth, không cần mail)

Mỗi mục là một phần có thể review riêng; làm theo thứ tự.

Trạng thái 2026-10-23: mục 1–11 và 13 đã làm (mục 11 chỉ thử được luồng `/auth/link` bằng cookie tự tạo, chưa thử redirect GitHub/Google thật). Mục 12 (deploy prod) chưa làm. Khác plan: tên hàm mới là `sign_in_with_provider`, giữ `auth_with_provider` cũ để bản app đang chạy không lỗi lúc deploy; xóa nó ở migration sau.

1. **Migration** `20261023_001_oauth_account_linking.sql` theo 10.7 (bước 0), chạy trên branch Neon thử (tách từ `production`), rồi chạy export schema.
2. **`lib/oauthEmail.js`**: `verifiedProviderEmail({ provider, account, profile })` → email `lower(trim())` hoặc `null`. GitHub gọi `/user/emails` với `account.access_token`; Google đọc `profile.email_verified`. Test bằng mock `fetch`.
3. **Username** (10.6): hàm chuẩn hóa ở JS (`lib/username.js`), xử lý trùng trong SQL. Test: có dấu, có khoảng trắng, quá ngắn, trùng.
4. **`services/auth.service.js`**: thay `signUpWithProvider` bằng `signInWithProvider(...)` → `{ user }` (đã có session) hoặc `{ redirect }`. Ánh xạ `result`: `link_required` → đặt `cd_link`, trả `/auth/link`; `blocked` → `/auth/error?error=AccessDenied`; email `null` → `/auth/error?error=OAuthEmailUnverified`.
5. **`lib/authCookies.js`**: `setLinkCookie` / `readLinkCookie` / `clearLinkCookie`, niêm phong AES-GCM như `sealRecovery` (context riêng `oauth-link|v1`), 10 phút, HttpOnly, SameSite=Lax, Secure khi https.
6. **`app/api/auth/[...nextauth]/route.js`**:
   - thêm callback `signIn`: OAuth gọi `signInWithProvider`, gắn kết quả vào `user`, hoặc trả URL; credentials có `credentials.link === "1"` thì liên kết theo `cd_link` (5a).
   - `jwt` nhánh OAuth chỉ còn `return startSession(token, user)`.
   - `CredentialsProvider.credentials` thêm field `link`.
7. **Trang `/auth/link`** (`app/auth/link/page.jsx`, `components/auth/linkAccount.jsx`): đọc tóm tắt qua `GET /api/auth/link` (provider, email đã che, username; không trả gì khi thiếu cookie), form 5a, nút Cancel (`DELETE /api/auth/link` xóa cookie).
8. **`components/auth/errorPage.jsx`**: thêm `OAuthEmailUnverified`, `OAuthAccountInUse`, `LinkExpired`.
9. **Audit**: `account.linked`, `account.link_required` qua `auditAuth`.
10. **Test** theo 10.10 (phần không cần mail), rồi `npm test`.
11. **Kiểm thử tay trên local**: GitHub mới; Google cùng email với user mật khẩu (→ `/auth/link`, nhập mật khẩu → đã liên kết); GitHub không có email đã xác minh.
12. **Deploy**: chạy lại query kiểm tra ở 10.7 trên prod → apply migration → deploy → đăng nhập thử GitHub và Google trên prod.
13. **Docs**: cập nhật flow OAuth trong `docs/auth.md`.

Ngoài bước 0: Settings "Sign-in methods" (10.4, 10.5) ở bước 6; 5b và mail báo liên kết ở bước 5.
