# AgentMail, đợt 1: gửi mail tới người dùng

Trạng thái 2026-11-07: thiết kế đã chốt, chưa implement. Nhận mail (webhook, `/admin/mail`, trả lời trong thread) và xử lý bounce / complaint là các đợt sau, có spec riêng.

## 1. Bối cảnh

Mọi mail gửi đi (xác minh email, nhắc khóa / xóa tài khoản, liên kết tài khoản, thông báo tài khoản) đều qua `sendMail` trong `lib/mail.js` (nodemailer). Production dùng Gmail SMTP với App Password, development dùng Mailpit (`compose.yml`). Mọi lần gửi đều đi từ auth outbox (`services/authOutbox.service.js`): lỗi thì retry có backoff, quá `max_attempts` (8) thì dòng chuyển sang `ops.dead_letters`.

Dự án chuyển dần sang AgentMail. Đợt này **chỉ thay đường gửi**.

Đã chốt trong chat:
- Mục tiêu: thay Gmail cho mail gửi đi; mail hai chiều làm sau.
- Chưa có domain riêng: gửi từ một inbox `@agentmail.to`.
- Production đã có biến `AGENTMAIL_API_KEY`; không bắt buộc đặt `MAIL_HOST`.

## 2. Cách làm: SMTP của AgentMail qua transport hiện có, thêm mode `agentmail`

AgentMail có SMTP (docs.agentmail.to/imap-smtp): `smtp.agentmail.to:465` (TLS ngay từ đầu), username là địa chỉ inbox, password là API key, From phải trùng địa chỉ inbox.

`lib/mailConfig.mjs` thêm mode `agentmail`, bật khi có `AGENTMAIL_API_KEY`. Server là hằng số trong code (`AGENTMAIL_SERVER`, giống `GMAIL_SERVER`):

```
AGENTMAIL_API_KEY=<đã có ở production>
MAIL_FROM=CodeDev <codedev@agentmail.to>   # phải là địa chỉ inbox AgentMail
```

Thứ tự trong `mailConfig(env)`:
1. Có `AGENTMAIL_API_KEY` → mode `agentmail`: `smtp.agentmail.to:465`, `secure: true`, `auth = { user: địa chỉ của MAIL_FROM, pass: AGENTMAIL_API_KEY }`. Thiếu `MAIL_FROM` → `{ error: "MAIL_FROM (the AgentMail inbox address) is required with AGENTMAIL_API_KEY" }`. Mode này bỏ qua `MAIL_HOST` / `MAIL_PASSWORD`.
2. Có `MAIL_PASSWORD` → `gmail`, hoặc `smtp` khi có `MAIL_HOST`, như hiện tại.
3. Không có cả hai → Mailpit ở dev / test, `{ error }` ở production, như hiện tại.

`MAIL_HOST` / `MAIL_PORT` vẫn là lựa chọn cho provider SMTP khác.

Quay lại Gmail: bỏ `AGENTMAIL_API_KEY`, đặt lại `MAIL_FROM` / `MAIL_PASSWORD` của Gmail. Đợt này không thêm biến chọn provider; đợt inbound có thể thêm nếu key phải giữ nguyên.

**Vì sao chưa dùng SDK / REST:** nodemailer giữ được Mailpit cho dev, giữ Gmail làm đường lui chỉ bằng env, không thêm dependency, không đổi caller nào. REST (gọi bằng `fetch`, giống `lib/beams.js`) vào cùng đợt inbound, khi cần trả lời trong thread.

**Không dùng `Idempotency-Key`:** mỗi lần outbox retry tạo token verify / link mới và xóa token cũ (`db/emailToken.db.js:36-39`). Nếu AgentMail bỏ qua lần retry vì trùng key, mail đã giao sẽ mang link chết. Thỉnh thoảng trùng một mail là lỗi an toàn hơn, và hiện tại cũng vậy.

## 3. Thay đổi

Code:
- `lib/mailConfig.mjs`: hằng `AGENTMAIL_SERVER = { host: "smtp.agentmail.to", port: 465 }`, nhánh `agentmail` đầu tiên trong `mailConfig`, thêm mode vào JSDoc kiểu trả về, cập nhật comment đầu file. `describeMail` tự in `agentmail smtp.agentmail.to:465 from CodeDev <codedev@agentmail.to>` (log khởi động, trang Settings admin).
- `lib/mail.js`: comment đầu file nhắc AgentMail. Code transport không đổi, vì nó đọc host / port / secure / auth từ config. Gợi ý Mailpit giữ nguyên.
- `lib/envCheck.mjs`: không đổi (`mail.error` đã được báo).
- `jobs/outbox.js:8`: comment của throttle nói nó giữ giới hạn của provider (AgentMail Free 100 mail/ngày), không còn là Gmail. Giữ `throttle {limit:10, period:"1m"}`.

Test, trong các test `mailConfig` có sẵn ở `__tests__/auth/oauthLinking.test.js`:
- `AGENTMAIL_API_KEY` + `MAIL_FROM` → mode `agentmail`, `smtp.agentmail.to:465`, `secure: true`, `auth = { user: địa chỉ inbox, pass: key }`;
- `AGENTMAIL_API_KEY` thắng `MAIL_PASSWORD` / `MAIL_HOST`;
- `AGENTMAIL_API_KEY` thiếu `MAIL_FROM` → `{ error }`;
- `describeMail` không bao giờ chứa key.

Tài liệu:
- `.env.example`, khối mail: `# AGENTMAIL_API_KEY=` kèm comment (MAIL_FROM phải là inbox).
- `docs/auth.md`, mục "Email" và bảng env: thêm dòng `AGENTMAIL_API_KEY` và thứ tự ở mục 2.
- `docs/environments.md` (khoảng dòng 15, 129-130, 152-153): provider production là AgentMail, Gmail là đường lui.

## 4. Triển khai dần (chủ dự án làm tay)

1. Kiểm tra tài khoản AgentMail đã **verified**. Tài khoản chưa verify chỉ gửi được tới người đăng ký (403 `message_rejected`).
2. Có inbox `codedev` (hoặc inbox đang có) với `display_name: "CodeDev"`. Đặt `MAIL_FROM` ở production là địa chỉ inbox đó. `AGENTMAIL_API_KEY` đã có.
3. Thử không cần chạy app: `npm run mail:test -- --env .env.production --to <bạn>`.
4. Deploy preview / staging trước, gửi một mail xác minh thật, rồi mới production.
5. Quay lại: bỏ `AGENTMAIL_API_KEY`, đặt lại `MAIL_FROM` / `MAIL_PASSWORD` của Gmail.

Giới hạn cần biết trước khi lên production:
- Gói Free: 100 mail/ngày. Tài khoản mới chỉ gửi được tới 3 người nhận khác nhau trong giờ đầu, 5 trong ngày đầu, 10 trong tuần đầu. Mail vượt giới hạn sẽ lỗi, outbox retry, sau 8 lần thì vào `ops.dead_letters` (Admin → System retry được). Production cần gói Developer (1.000 mail/ngày) hoặc chờ hết giai đoạn làm nóng.
- Người dùng trả lời mail hệ thống sẽ gửi vào inbox `codedev@agentmail.to`. Trước đợt inbound, đọc trên console AgentMail.
- AgentMail tự chặn gửi tới địa chỉ đã bounce / complaint, nhưng app chưa biết (đợt bounce).

## 5. Kiểm tra

- `npx vitest run __tests__/auth/oauthLinking.test.js` (các case `mailConfig`), rồi chạy toàn bộ test.
- `npm run mail:test -- --env <file có giá trị AgentMail> --to <địa chỉ chủ dự án>`: in `agentmail smtp.agentmail.to:465 from CodeDev <codedev@agentmail.to>` và message id; mail đến với người gửi "CodeDev".
- Trên staging: đăng ký, nhận mail xác minh, mở link → verified. Dòng outbox đã xử lý, dead letters trống.
