# AgentMail, đợt 1: gửi mail tới người dùng

Trạng thái 2026-11-07: thiết kế đã chốt, chưa implement. Nhận mail (webhook, `/admin/mail`, trả lời trong thread) và xử lý bounce / complaint là các đợt sau, có spec riêng.

## 1. Bối cảnh

Mọi mail gửi đi (xác minh email, nhắc khóa / xóa tài khoản, liên kết tài khoản, thông báo tài khoản) đều qua `sendMail` trong `lib/mail.js` (nodemailer). Production dùng Gmail SMTP với App Password, development dùng Mailpit (`compose.yml`). Mọi lần gửi đều đi từ auth outbox (`services/authOutbox.service.js`): lỗi thì retry có backoff, quá `max_attempts` (8) thì dòng chuyển sang `ops.dead_letters`.

Dự án chuyển dần sang AgentMail. Đợt này **chỉ thay đường gửi**.

Đã chốt trong chat:
- Mục tiêu: thay Gmail cho mail gửi đi; mail hai chiều làm sau.
- Chưa có domain riêng: gửi từ một inbox `@agentmail.to`.
- Production đã có biến `AGENTMAIL_API_KEY`; không bắt buộc đặt `MAIL_HOST`.

## 2. Cách làm: AgentMail gửi chính, Gmail làm fallback

Sửa đổi 2026-11-07 (thay bản đầu, khi AgentMail dùng chung `MAIL_FROM`): mỗi đường gửi có biến riêng, không trùng tên; AgentMail lỗi thì gửi lại qua Gmail ngay trong cùng lần gửi.

AgentMail có SMTP (docs.agentmail.to/imap-smtp): `smtp.agentmail.to:465` (TLS ngay từ đầu), username là địa chỉ inbox, password là API key, From phải trùng địa chỉ inbox.

| Đường | Biến | Ghi chú |
|---|---|---|
| AgentMail (chính) | `AGENTMAIL_API_KEY`, `AGENTMAIL_FROM` | `AGENTMAIL_FROM` = inbox, ví dụ `CodeDev <codedev@agentmail.to>`: vừa là From vừa là SMTP user. Key được trim |
| | `AGENTMAIL_HOST` | không bắt buộc, mặc định `smtp.agentmail.to`; port 465, `secure: true` |
| Gmail (fallback) | `MAIL_FROM`, `MAIL_PASSWORD` | như trước; `MAIL_HOST` / `MAIL_PORT` vẫn để đổi sang provider SMTP khác |
| Dev | không đặt gì | Mailpit |

`lib/mailConfig.mjs`:
- `mailConfig(env)` quay lại như trước: gmail / smtp / mailpit / `{ error }`. Lỗi production khi không có gì: `"MAIL_FROM / MAIL_PASSWORD (or AGENTMAIL_API_KEY + AGENTMAIL_FROM) are not set: no email can be sent"`.
- `agentmailConfig(env)`: `null` khi key trống; `{ error: "AGENTMAIL_FROM (the AgentMail inbox, e.g. CodeDev <codedev@agentmail.to>) is required with AGENTMAIL_API_KEY" }` khi thiếu hoặc sai `AGENTMAIL_FROM`; ngược lại config mode `agentmail`.
- `mailRoutes(env)` → `{ routes, errors }`: AgentMail (nếu hợp lệ) rồi Gmail / SMTP. Gmail / SMTP chỉ được thêm khi chưa có route nào hoặc `MAIL_PASSWORD` có giá trị, nên Mailpit không bao giờ làm fallback cho AgentMail. Cấu hình sai của một đường vào `errors`, đường đó bị bỏ qua.
- `describeRoutes({ routes, errors })`: `agentmail smtp.agentmail.to:465 from … -> fallback gmail smtp.gmail.com:465 from …`, hoặc `not configured (…)` khi không có route.

`lib/mail.js`:
- `sendMail` thử từng route theo thứ tự. Lỗi bất kỳ (vượt giới hạn, sai key, mất kết nối, timeout) thì `console.warn("[mail] agentmail failed, trying gmail: …")` rồi thử route kế. Route đầu thành công thì trả message id. Tất cả lỗi thì throw một lỗi gộp từng route (`describeMail` + thông báo lỗi, không có key / password) để outbox retry như cũ. Không có route thì throw các `errors`.
- Cache transport theo từng server (Map), để hai route xen kẽ không tạo lại transport mỗi lần.
- `verifyMail` đăng nhập lần lượt từng route; route nào lỗi thì throw, lỗi có tên route.

`lib/envCheck.mjs`: `errors` nhận `mail: <lỗi>` cho từng lỗi của `mailRoutes`. Cảnh báo gmail.com cho route gmail giữ nguyên. Môi trường deploy chỉ có route AgentMail thì cảnh báo `mail: MAIL_PASSWORD is not set: no Gmail fallback when AgentMail fails`. Hai cảnh báo "AGENTMAIL_API_KEY takes over" của bản đầu bị bỏ. Trường `mail` dùng `describeRoutes`.

`scripts/mail-test.mjs` in `describeRoutes`, thoát 1 khi không có route, rồi `verifyMail` và gửi thử như trước.

**Đánh đổi của fallback khi gặp mọi lỗi (đã chọn):**
- AgentMail bị timeout nhưng thực ra đã nhận mail, rồi Gmail gửi thêm: người dùng nhận 2 mail. Cùng một lần outbox nên cùng token, link nào cũng dùng được.
- Địa chỉ AgentMail đã chặn vì bounce vẫn được gửi qua Gmail.
- Trường hợp xấu nhất, một lần gửi chờ khoảng 40 s (AgentMail timeout rồi mới đến Gmail).
- Cấu hình AgentMail hỏng chỉ lộ qua log `[mail] agentmail failed` và qua `mail:test`.

**Vì sao chưa dùng SDK / REST:** nodemailer giữ được Mailpit cho dev, không thêm dependency, không đổi caller nào. REST (gọi bằng `fetch`, giống `lib/beams.js`) vào cùng đợt inbound.

**Không dùng `Idempotency-Key`:** mỗi lần outbox retry tạo token verify / link mới và xóa token cũ (`db/emailToken.db.js:36-39`). Nếu AgentMail bỏ qua lần retry vì trùng key, mail đã giao sẽ mang link chết.

## 3. Test

`__tests__/auth/oauthLinking.test.js` (`mailRoutes`, `describeRoutes`, `checkEnvironment`):
- AgentMail + Gmail → modes `["agentmail", "gmail"]`, mỗi route đăng nhập bằng địa chỉ của riêng nó; key có khoảng trắng / xuống dòng được trim; địa chỉ chữ hoa thành chữ thường, giữ tên hiển thị.
- `AGENTMAIL_HOST` thay server.
- Chỉ AgentMail ở development → `["agentmail"]` (không có Mailpit).
- Key trống → `["mailpit"]`; key thiếu `AGENTMAIL_FROM` → lỗi đúng câu trên và route còn lại vẫn dùng được.
- `describeRoutes` đúng chuỗi trên; `checkEnvironment` không chứa key hay password; cảnh báo "no Gmail fallback" chỉ khi deploy chỉ có AgentMail.

`__tests__/auth/mailFallback.test.js` (nodemailer giả):
- AgentMail thành công → không gọi Gmail.
- AgentMail lỗi → gửi qua Gmail, có `console.warn` "agentmail failed, trying gmail".
- Cả hai lỗi → throw lỗi gộp nêu cả hai server, không chứa key / password.
- Không có route (production, không đặt gì) → throw "not set".

Tài liệu: `.env.example`, `docs/auth.md`, `docs/environments.md`, README, comment trong `scripts/mail-test.mjs` và `compose.yml` (dev phải để trống `AGENTMAIL_API_KEY`).

## 4. Triển khai dần (chủ dự án làm tay)

1. Kiểm tra tài khoản AgentMail đã **verified**. Tài khoản chưa verify chỉ gửi được tới người đăng ký (403 `message_rejected`).
2. Có inbox `codedev` (hoặc inbox đang có) với `display_name: "CodeDev"`. Đặt `AGENTMAIL_FROM` ở production là địa chỉ inbox đó. `AGENTMAIL_API_KEY` đã có; giữ `MAIL_FROM` / `MAIL_PASSWORD` của Gmail làm fallback.
3. Thử không cần chạy app: `npm run mail:test -- --env .env.production --to <bạn>`.
4. Deploy preview / staging trước, gửi một mail xác minh thật, rồi mới production.
5. Quay lại chỉ dùng Gmail: bỏ `AGENTMAIL_API_KEY`.

Giới hạn cần biết trước khi lên production:
- Gói Free: 100 mail/ngày. Tài khoản mới chỉ gửi được tới 3 người nhận khác nhau trong giờ đầu, 5 trong ngày đầu, 10 trong tuần đầu. Mail vượt giới hạn rơi sang Gmail (giới hạn khoảng 500 người nhận/ngày); chỉ khi cả hai lỗi thì outbox retry, sau 8 lần vào `ops.dead_letters`.
- Người dùng trả lời mail hệ thống sẽ gửi vào inbox `codedev@agentmail.to`. Trước đợt inbound, đọc trên console AgentMail.
- AgentMail tự chặn gửi tới địa chỉ đã bounce / complaint, nhưng app chưa biết (đợt bounce).

## 5. Kiểm tra

- `npx vitest run __tests__/auth/oauthLinking.test.js` (các case `mailConfig`), rồi chạy toàn bộ test.
- `npm run mail:test -- --env <file có giá trị AgentMail> --to <địa chỉ chủ dự án>`: in `agentmail smtp.agentmail.to:465 from CodeDev <codedev@agentmail.to> -> fallback gmail …`, đăng nhập được cả hai, gửi thử in message id; mail đến với người gửi "CodeDev".
- Trên staging: đăng ký, nhận mail xác minh, mở link → verified. Dòng outbox đã xử lý, dead letters trống.
