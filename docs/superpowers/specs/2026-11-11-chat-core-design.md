# Chat: lõi tin nhắn 1-1 và nhóm — thiết kế

Date: 2026-11-11. Status: implemented, except revision 2 (2026-11-11): đính kèm lưu bằng Cloudinary (ảnh) + S3 (file) thay Upstash Blob, thêm đính kèm file — designed, not implemented (mục 4, 7, plan phần R2). Sub-project 1/3 của "message chat" (`future-plan.txt`, `docs/development-plan.md` §3.2).

## 1. Context

`docs/development-plan.md` §3.2 ghi "chat realtime 1-1 và theo team qua private channel". Hiện trạng:

- Realtime: Pusher, mỗi user một kênh `private-user-{publicId}` (`lib/realtime.js`). `/api/pusher/auth` chỉ cho subscribe kênh của chính mình. `UserRealtimeBridge` (`components/realtime/userRealtimeBridge.jsx`) nghe kênh này và invalidate React Query. `publish()` / `publishToUser()` ở `lib/pusher.js` (có `socketId` để loại tab gửi).
- Web push: Beams, `pushToUsers(userIds, { title, body, link })` (`lib/beams.js`).
- Storage: S3-compatible qua `lib/s3.js` + `lib/storageConfig.mjs` (MinIO khi dev, S3 khi production), có presign GET.
- DB: `community.messages`, `community.friend`, `community.team`, `community.team_members` đã có trong `db/schema.sql` nhưng **không có code nào dùng**. Social chỉ có tìm người (`socialService.searchUsers`, tôn trọng `profile.info.show_profile`).
- Quy ước: đọc qua route `GET` + React Query, ghi chỉ UI gọi qua server action `runAction` (`docs/superpowers/specs/2026-11-10-api-vs-action-boundary-design.md`), keyset pagination (`docs/api-conventions.md`), state theo `docs/state-management.md`.

### Chia sub-project

1. **Lõi chat (spec này):** hội thoại 1-1 và nhóm, tin nhắn, hộp chờ, chặn, báo cáo, ảnh, realtime, đã xem, đang gõ, sửa/thu hồi, push, trang `/messages`.
2. **Bạn bè:** gửi/chấp nhận kết bạn. Không chặn sub-project 1: bạn bè chỉ làm hội thoại 1-1 bỏ qua hộp chờ.
3. **Team:** tạo team, mời, rời, kick. Gọi `chatService.ensureTeamConversation` và `chatService.syncTeamMember` của spec này.

## 2. Quyết định đã chốt với user

| # | Quyết định |
|---|---|
| D1 | Có cả chat 1-1 và chat team (team 2–5 người, `chk_team_size`). |
| D2 | 1-1: ai cũng nhắn được cho người bật `show_profile`. Tin từ người chưa quen vào **hộp chờ** (message request). |
| D3 | Nội dung: text, khối code (```` ``` ````) được tô màu, ảnh, file đính kèm (tài liệu + code, revision 2). |
| D4 | Đính kèm lưu private (revision 2, thay Upstash Blob). Local: ảnh và file vào MinIO, bucket `codedev-chat-media`. Production: ảnh lên **Cloudinary** `type: "authenticated"` (tài khoản Cloudinary production đã có), file lên **S3** private (`S3_CHAT_BUCKET` trên endpoint `AWS_*` đã có). Xem qua link ký có hạn. |
| D5 | Giao diện: trang `/messages` (hai cột desktop, một cột mobile) + icon tin nhắn trên navbar cạnh chuông, có badge. |
| D6 | Có: đã xem (✓✓), đang gõ, sửa/thu hồi, web push khi chưa đọc. |
| D7 | Realtime: fan-out qua kênh user có sẵn (phương án A); tin lớn chỉ gửi ping, client fetch (phương án C). |

Mặc định do thiết kế này đặt (user đã duyệt cùng các phần thiết kế):

- Một tin: tối đa 4.000 ký tự, tối đa 4 đính kèm (ảnh và file tính chung).
- Ảnh: tối đa 5 MB, chỉ `image/jpeg`, `image/png`, `image/webp`.
- File (revision 2): tối đa 20 MB, theo đuôi file `pdf txt md csv json zip js ts jsx tsx py java c cpp h go rs sql`; mọi đuôi khác bị chặn (gồm html, svg, file thực thi).
- Sửa trong 15 phút sau khi gửi; thu hồi không giới hạn thời gian.
- Khi người nhận còn `pending`, người gửi chỉ gửi được 1 tin, không kèm đính kèm nào.
- Push gom theo hội thoại trong 60 giây, chỉ gửi khi tin vẫn chưa đọc; tin trong hộp chờ không push.
- Admin chỉ thấy đúng tin bị báo cáo, không đọc được cả hội thoại.

Ngoài phạm vi: gọi thoại/video, file ngoài danh sách cho phép, xem trước nội dung file (pdf viewer, code preview), quét virus, reaction, trả lời trích dẫn, tìm kiếm trong tin nhắn, tắt thông báo theo hội thoại, dock chat nổi, chỉnh sửa ảnh/thumbnail, presence online.

## 3. Mô hình dữ liệu

Migration `db/migrations/20261111_025_chat.sql`, schema `community`, theo quy ước của `20261109_022_blog_interactions.sql`: `id bigint GENERATED ALWAYS AS IDENTITY`, `public_id varchar(40)` là id ra ngoài, `timestamptz`. Sau khi chạy: cập nhật `db/schema.sql` / `db/schema.dbml` bằng `npm run db:export`.

```sql
CREATE TYPE community.conversation_kind AS ENUM ('direct', 'team');
CREATE TYPE community.member_state AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE community.conversation (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    kind community.conversation_kind NOT NULL,
    direct_key varchar(41) UNIQUE,            -- "<least user id>:<greatest user id>"
    team_id varchar(50) UNIQUE REFERENCES community.team(id) ON DELETE CASCADE,
    last_message_id bigint,
    last_message_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'direct') = (direct_key IS NOT NULL)),
    CHECK ((kind = 'team') = (team_id IS NOT NULL))
);

CREATE TABLE community.conversation_member (
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    state community.member_state NOT NULL,
    last_read_message_id bigint NOT NULL DEFAULT 0,
    left_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_member_user ON community.conversation_member (user_id, state) WHERE left_at IS NULL;

CREATE TABLE community.chat_message (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    sender_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
    edited_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sender_id, client_id)
);
CREATE INDEX idx_chat_message_conversation ON community.chat_message (conversation_id, id DESC);

CREATE TABLE community.chat_attachment (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    uploader_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    message_id bigint REFERENCES community.chat_message(id) ON DELETE CASCADE,  -- NULL: uploaded, not sent
    storage_key text UNIQUE NOT NULL,
    content_type varchar(40) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5000000),
    width integer,
    height integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_attachment_message ON community.chat_attachment (message_id);
CREATE INDEX idx_chat_attachment_orphan ON community.chat_attachment (created_at) WHERE message_id IS NULL;

CREATE TABLE community.user_block (
    blocker_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    blocked_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_user_block_blocked ON community.user_block (blocked_id);

CREATE TABLE community.chat_report (
    message_id bigint NOT NULL REFERENCES community.chat_message(id) ON DELETE CASCADE,
    reporter_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    reason varchar(500) NOT NULL CHECK (char_length(reason) >= 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    UNIQUE (message_id, reporter_id)
);
CREATE INDEX idx_chat_report_open ON community.chat_report (created_at) WHERE resolved_at IS NULL;
```

**Revision 2:** migration mới `db/migrations/20261111_026_chat_files.sql` (025 đã chạy ở local, không sửa lại):

```sql
ALTER TABLE community.chat_attachment
    ADD COLUMN kind varchar(10) NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'file')),
    ADD COLUMN provider varchar(20) NOT NULL DEFAULT 's3' CHECK (provider IN ('s3', 'cloudinary')),
    ADD COLUMN file_name varchar(255),                -- tên hiển thị đã làm sạch; NULL cho ảnh
    DROP CONSTRAINT chat_attachment_content_type_check,
    DROP CONSTRAINT chat_attachment_size_bytes_check,
    ADD CONSTRAINT chat_attachment_kind_type CHECK (
        (kind = 'image' AND content_type IN ('image/jpeg', 'image/png', 'image/webp') AND size_bytes BETWEEN 1 AND 5000000)
        OR (kind = 'file' AND content_type IN ('application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/zip')
            AND size_bytes BETWEEN 1 AND 20000000 AND file_name IS NOT NULL)
    ),
    ADD CONSTRAINT chat_attachment_cloudinary_image CHECK (provider = 's3' OR kind = 'image');
```

Tên constraint cũ là tên Postgres sinh ra ở migration 025 (đã kiểm tra ở DB local: `chat_attachment_content_type_check`, `chat_attachment_size_bytes_check`). `content_type` của file do server quyết theo đuôi (bảng ở mục 4), không lấy từ trình duyệt.

`community.messages` (bảng cũ, `id integer`, không có `client_id`, không chứa được nhóm) bị `DROP` trong cùng migration. **Điều kiện:** trước khi chạy `db:migrate:prod`, xác nhận `SELECT count(*) FROM community.messages` = 0 ở production; nếu khác 0, dừng và hỏi user.

### Luật nghiệp vụ

1. **Mở hội thoại 1-1.** A gửi tin đầu cho B (`toUserId`): upsert `conversation` theo `direct_key`. A ở `accepted`. B ở `accepted` nếu `community.friend` có cặp A–B ở `accepted` hoặc A và B cùng một team (`team_members.status = 'approved'`); ngược lại B ở `pending`. B phải bật `show_profile` và `status = 'active'`, nếu không trả 404.
2. **Hộp chờ.** Khi B còn `pending`: A chỉ có 1 tin trong hội thoại, không đính kèm; B thấy hội thoại ở tab Requests; B không phát ✓✓ và "đang gõ". B chấp nhận → `accepted`. B từ chối → `declined`: hội thoại ẩn khỏi B, A không được báo, tin tiếp theo của A trả 403. B tự nhắn cho A → B về `accepted`.
3. **Chặn** áp dụng cho 1-1, theo cả hai chiều: nếu có `user_block` theo bất kỳ chiều nào thì không gửi được tin và không tạo được hội thoại mới (403). Hội thoại cũ vẫn đọc được. Chat team không bị ảnh hưởng.
4. **Team.** `ensureTeamConversation(teamId)` tạo hội thoại `team` (idempotent theo `team_id`). `syncTeamMember(teamId, userId, 'joined' | 'left')`: joined → upsert member `accepted`, `left_at = NULL`; left → `left_at = now()`. Thành viên có `left_at` không đọc, không gửi được (404).
5. **Chưa đọc.** Hội thoại chưa đọc khi có tin `id > last_read_message_id`, `sender_id <> me`, `deleted_at IS NULL`. Badge navbar = số hội thoại chưa đọc ở trạng thái `accepted` (không đếm số tin). Requests đếm riêng số hội thoại `pending`.
6. **Gửi tin tự tính là đã đọc** cho người gửi (`last_read_message_id = new id`).
7. **Sửa** chỉ người gửi, trong 15 phút từ `created_at`, chỉ `body`, đặt `edited_at`. Tin đã thu hồi không sửa được.
8. **Thu hồi** chỉ người gửi (hoặc admin qua báo cáo): `deleted_at = now()`, `body = ''`, xoá dòng attachment và file. UI hiện "Tin nhắn đã được thu hồi".
9. **Xoá tài khoản** cascade xoá tin, thành viên và chặn của người đó (giống `post_comment`). Hội thoại 1-1 còn một thành viên vẫn giữ.

## 4. Lưu đính kèm (revision 2)

Thay thiết kế Upstash Blob ban đầu. Upstash bị bỏ hẳn: gỡ `@upstash/blob`, biến `UPSTASH_BLOB_TOKEN`, và mọi nhánh code của nó.

| | Local / dev / test | Production |
|---|---|---|
| Ảnh | MinIO `codedev-chat-media` | Cloudinary, `type: "authenticated"`, public id `codedev/chat/{cnv}/{att}` (theo quy ước folder `codedev/...` của `lib/cloudinary.js`) |
| File | MinIO `codedev-chat-media` | S3 private, bucket `S3_CHAT_BUCKET` trên endpoint `AWS_*` (`lib/storageConfig.mjs`) |

Theo spec media 2026-11-09, tài khoản Cloudinary chỉ dùng cho production: dev và test không bao giờ ghi lên Cloudinary. Cột `provider` của mỗi dòng ghi nơi lưu thật, nên đọc và xoá luôn đi đúng chỗ, kể cả khi env thay đổi sau này.

`lib/chatMedia.js` (server-only) đổi interface, mọi hàm nhận một attachment `{ kind, provider, storageKey, contentType, size, fileName }`:

```js
storageFor(kind)                        // -> "cloudinary" | "s3": nơi lưu cho upload mới theo env
uploadTicket(att)                       // -> { method: "PUT", url, headers } | { method: "POST", url, fields }
inspect(att)                            // -> { contentType, size } | null (không tồn tại)
readUrl(att)                            // -> URL có hạn (ảnh: xem; file: tải về)
remove(att)                             // không tồn tại vẫn thành công
```

**S3 / MinIO** (ảnh local, file mọi môi trường): giữ code hiện có trong `lib/s3.js`.
- Upload: presign PUT, ký `Content-Type` và `Content-Length`, checksum `WHEN_REQUIRED`.
- `inspect`: `HeadObject`.
- `remove`: `DeleteObject`.
- `readUrl`:
  - ảnh: presign GET 300 giây;
  - file: `getDownloadUrl` với `ResponseContentDisposition: attachment; filename="<file_name>"`, nên trình duyệt luôn tải về chứ không mở ra.
- Key do server sinh: `chat/{cnv}/{att}.{ext}`. `ext` lấy theo bảng loại file bên dưới, không bao giờ từ tên file người dùng.

**Cloudinary** (ảnh production), dùng SDK `cloudinary` đã có:
- Upload: signed upload thẳng từ trình duyệt. Server trả `{ method: "POST", url: "https://api.cloudinary.com/v1_1/<cloud>/image/upload", fields }`. `fields` gồm `api_key`, `timestamp`, `public_id`, `type: "authenticated"`, `allowed_formats: "jpg,png,webp"`, `overwrite: false` và `signature`, ký bằng `cloudinary.utils.api_sign_request` với `CLOUDINARY_API_SECRET`. Secret không bao giờ ra client. Ảnh tối đa 5 MB.
- `inspect`: `cloudinary.api.resource(public_id, { type: "authenticated" })`. So `format` với loại đã khai báo và `bytes` với kích thước đã khai báo. Lỗi `not found` thì trả `null`.
- `readUrl`: `cloudinary.utils.private_download_url(public_id, format, { type: "authenticated", expires_at: now + 300 })`. Link hết hạn thật sau 5 phút. Link đi qua API Cloudinary chứ không qua CDN: không có resize/thumbnail, và mỗi lần xem tính vào quota API.
- `remove`: `destroyAsset(public_id, { resourceType: "image" })` cộng `type: "authenticated"`. Mở rộng `lib/cloudinary.js` để nhận `type`; caller hiện có giữ mặc định.

**Loại file cho phép** (`lib/chat/limits.js`, đuôi viết thường → content-type lưu):

| Đuôi | Content-type |
|---|---|
| `pdf` | `application/pdf` |
| `txt` `js` `ts` `jsx` `tsx` `py` `java` `c` `cpp` `h` `go` `rs` `sql` | `text/plain` |
| `md` | `text/markdown` |
| `csv` | `text/csv` |
| `json` | `application/json` |
| `zip` | `application/zip` |

**Cấu hình**:
- `buckets.chat = S3_CHAT_BUCKET || "codedev-chat-media"`.
- Production thiếu `CLOUDINARY_*`: upload ảnh trả 503 "Chat images are not configured".
- Production thiếu `S3_CHAT_BUCKET`: upload file trả 503 "Chat files are not configured".
- Cả hai trường hợp chỉ ghi `warnings`, không chặn khởi động và không ảnh hưởng S3 khác (giữ cách làm của R8b).
- Production vẫn không thể rơi về MinIO nhờ luật isolation có sẵn.

**Khác**:
- `scripts/storage-sync.mjs --init` tạo bucket `codedev-chat-media` trong MinIO. MinIO không hỗ trợ `PutBucketCors` nên dùng CORS mặc định. `storage-sync` không đồng bộ bucket chat.
- Không có lifecycle rule theo prefix trên cả hai nơi lưu: dọn dẹp do job (mục 8).
- `.env.example`:
  - bỏ `UPSTASH_BLOB_TOKEN`;
  - giữ `S3_CHAT_BUCKET`, ghi chú bắt buộc ở production cho file chat;
  - ghi chú `CLOUDINARY_*` cũng phục vụ ảnh chat ở production.

## 5. Bề mặt API

Theo quy tắc của spec api-vs-action-boundary.

**Route `GET`** (React Query), `apiRoute`, envelope `{ success, data }`, `Cache-Control: no-store` trừ route ảnh:

| Route | Trả về |
|---|---|
| `GET /api/chat/conversations?tab=all\|requests&cursor=` | `{ items, nextCursor }`, keyset `(last_message_at, id)`; item: id, kind, title, avatar, last message preview, unread, state |
| `GET /api/chat/conversations/[id]` | chi tiết hội thoại + thành viên + `last_read_message_id` của từng người (cho ✓✓) |
| `GET /api/chat/conversations/[id]/messages?before=<messageId>` | 30 tin, mới nhất trước, `nextCursor` |
| `GET /api/chat/messages/[id]` | một tin (sau khi nhận ping) |
| `GET /api/chat/unread` | `{ unread, requests }` cho badge |
| `GET /api/chat/blocks` | danh sách người mình chặn (settings) |
| `GET /api/chat/attachments/[id]` | 302 tới `readUrl(att)` (ảnh: xem; file: tải về), `Cache-Control: private, max-age=240` (quy tắc 6: redirect) |

**Server action** (`actions/chat.actions.js`, bọc `runAction`):

| Action | Limiter |
|---|---|
| `sendMessageAction({ conversationId?, toUserId?, clientId, body, attachmentIds })` | `chatSend` 30/60s |
| `editMessageAction({ messageId, body })` | `chatSend` |
| `recallMessageAction(messageId)` | `chatSend` |
| `markReadAction({ conversationId, messageId })` | `chatRead` 120/60s |
| `typingAction(conversationId)` | `chatTyping` 30/60s |
| `respondRequestAction({ conversationId, accept })` | `chatSend` |
| `createChatUploadAction({ conversationId, kind, name, contentType, size, width, height })` → `{ attachmentId, upload }`, `upload` là vé PUT hoặc POST (mục 4); `contentType` của file do server quyết theo đuôi của `name` | `chatUpload` 20/60s |
| `blockUserAction(userId)` / `unblockUserAction(userId)` | `chatSend` |
| `reportMessageAction({ messageId, reason })` | `feedback` (có sẵn) |

Validate bằng schema thuần trong `lib/validation/chat.js` + `parseOrThrow`. Admin: `GET /api/admin/chat-reports`, `PATCH /api/admin/chat-reports/[messageId]` (route, vì cần `requirePermission`, quy tắc 4), action `hide` (thu hồi tin như luật 8) hoặc `dismiss`; ghi audit như các route admin khác.

**Client:** `keys/chat.keys.js`, `clients/chat.client.js` (chỉ GET), `queries/chat.query.js`, `mutations/chat.mutation.js` (`unwrapActionResult(await callWithAuthRetry(...))`).

## 6. Realtime

Thêm vào `lib/realtime.js` (kênh user, không thêm kênh mới, không sửa `/api/pusher/auth`):

| Event | Payload | Ai nhận |
|---|---|---|
| `chat-message` | `{ conversationId, message }` nếu JSON ≤ 8 KB; ngược lại `{ conversationId, messageId }` | mọi thành viên `accepted`/`pending` chưa rời, trừ tab gửi (`socketId`) |
| `chat-message-updated` | `{ conversationId, messageId }` | như trên |
| `chat-read` | `{ conversationId, userId, messageId }` | thành viên khác (không gửi khi người đọc còn `pending`) |
| `chat-typing` | `{ conversationId, userId }` | thành viên khác (không gửi khi `pending`/`declined`) |
| `chat-conversation-updated` | `{ conversationId }` | thành viên (chấp nhận yêu cầu, team đổi thành viên) |

Một lệnh `trigger` cho nhiều kênh (≤ 5 thành viên, Pusher cho tới 100 kênh mỗi lệnh). Pusher giới hạn 10 KB mỗi event, nên ngưỡng 8 KB để dư chỗ cho envelope.

`UserRealtimeBridge` thêm handler:

- `chat-message`: nếu có cache tin của hội thoại → `setQueryData` thêm vào trang đầu (khử trùng theo `id`, bỏ tin optimistic cùng `clientId`); không có → bỏ qua. Ping → fetch `GET /api/chat/messages/[id]` rồi thêm. Luôn invalidate inbox và `unread` với `cancelRefetch: false`.
- `chat-message-updated`, `chat-conversation-updated`: invalidate key tương ứng.
- `chat-read`: cập nhật `last_read_message_id` của thành viên trong cache chi tiết hội thoại.
- `chat-typing`: ghi vào store Zustand `useChatTypingStore` (`byConversation[id] = { userId: expiresAt }`), hết hạn sau 5 giây. Đây là state UI tạm thời, không phải dữ liệu server, nên hợp với `docs/state-management.md`.
- `onReconnect` (đã có) cũng invalidate `chatKeys.all`.

## 7. Các luồng

**Gửi.** Client sinh `clientId` (`crypto.randomUUID()`), thêm tin optimistic trạng thái `sending`, gọi `sendMessageAction`. Server, trong một transaction: khoá dòng member của người gửi, kiểm tra luật 1–4, insert tin `ON CONFLICT (sender_id, client_id) DO NOTHING` (trùng → trả tin cũ, không fan-out lại), gắn attachment (`uploader_id = me`, cùng hội thoại, `message_id IS NULL`, sau khi `inspect` khớp), cập nhật `last_message_*`, `last_read_message_id` của người gửi. Sau commit: fan-out, rồi gửi event Inngest `chat/message.created` cho từng người nhận `accepted`.

**Nhận.** Như mục 6. Trang hội thoại đang mở và tab hiển thị → đánh dấu đã đọc.

**Đã xem.** Khi tab hiển thị và khung chat cuộn tới cuối: `markReadAction` (debounce 1 giây) với id tin mới nhất; server `SET last_read_message_id = GREATEST(last_read_message_id, $id)` và chỉ publish `chat-read` khi giá trị tăng.

**Đang gõ.** Khi ô soạn thay đổi: gọi `typingAction` tối đa mỗi 3 giây. Server kiểm tra thành viên (cache Redis 60 giây theo `userId:conversationId`), publish `chat-typing`. Không ghi DB.

**Sửa / thu hồi.** Optimistic trên client, hoàn tác khi lỗi. Server publish `chat-message-updated`. Thu hồi: xoá file sau commit; lỗi → event Inngest `chat/attachment.delete` thử lại.

**Đính kèm (revision 2).**
1. `createChatUploadAction`:
   - kiểm tra người gọi là thành viên, và không ai trong hội thoại ở trạng thái khác `accepted`;
   - kiểm tra `kind`: ảnh theo loại và tối đa 5 MB; file theo đuôi và tối đa 20 MB;
   - làm sạch `name` thành `file_name`: bỏ đường dẫn và ký tự điều khiển, tối đa 255 ký tự;
   - chọn `provider` bằng `storageFor(kind)`;
   - insert `chat_attachment` với `message_id NULL`;
   - trả về `uploadTicket`.
2. Trình duyệt upload thẳng lên nơi lưu, có hiện tiến độ:
   - vé `PUT`: gửi file làm body, kèm `headers` (bỏ `Content-Length`);
   - vé `POST`: gửi `FormData` gồm các `fields` cộng field `file`.
3. Gửi tin kèm `attachmentIds`. Server `inspect` từng đính kèm. Không tồn tại, sai loại, hoặc lớn hơn khai báo thì trả 422 và xoá file.
4. Đọc: `/api/chat/attachments/{id}` kiểm tra người xem là thành viên chưa rời và tin chưa thu hồi, rồi trả 302 tới `readUrl`.
   - Ảnh: hiện bằng `<img>`. `width`/`height` do client báo, chỉ dùng để giữ tỉ lệ khung.
   - File: hiện thành thẻ có link tải về.

**Push.** Inngest function `chat-push`, `debounce: { key: "event.data.userId + ':' + event.data.conversationId", period: "60s" }`. Khi chạy: đọc member; nếu `state = 'accepted'`, chưa rời và `last_read_message_id < messageId` → `pushToUsers([userId], { title, body, link: "/messages/{conversationPublicId}" })`. `title`: tên người gửi (1-1) hoặc tên team. `body`: preview 80 ký tự đầu nếu chỉ có 1 tin chưa đọc, ngược lại "N tin nhắn mới"; khối code thành `[code]`, ảnh thành `[image]`, file thành `[file]` (inbox preview cũng vậy).

**Chặn / báo cáo.** Nút trong menu hội thoại 1-1 (chặn) và menu từng tin (báo cáo). Danh sách đã chặn + bỏ chặn trong `components/settings/privacySection.jsx`. Admin `/admin/chat-reports` theo mẫu kiểm duyệt bình luận blog (`app/admin/blog/page.jsx`, `GET/PATCH /api/admin/blog/comments`): chỉ hiện tin bị báo cáo, người gửi, lý do, số báo cáo.

## 8. Job

Trong `jobs/` (Inngest):

- `chat-push` (mục 7).
- `chat-attachment-delete`:
  - xoá file theo từng attachment, mỗi attachment có dạng `{ kind, provider, storageKey }`;
  - event `chat/attachment.delete` mang `{ items: [...] }` thay cho `{ keys }` cũ, để xoá đúng nơi lưu (Cloudinary hoặc S3);
  - retry mặc định, hết lượt thì đẩy vào dead-letter có sẵn.
- Cron `chat-orphan-attachments` (thêm vào `jobs/crons.js`, mỗi giờ):
  - chọn attachment có `message_id IS NULL` và `created_at < now() - 1 hour`;
  - xoá file theo `provider` rồi mới xoá dòng;
  - mỗi bước tối đa 50 dòng.

## 9. Giao diện

Trước khi bắt đầu task UI đầu tiên của plan: chạy `ui-consistency:finding-patterns` để lấy checklist (component, theme, trạng thái loading/empty/error) từ các trang có sẵn như `/notifications` và blog.

- Navbar: icon tin nhắn cạnh `notificationCenter`, badge số hội thoại chưa đọc (`useQuery` `GET /api/chat/unread`, `refetchInterval` 60 giây làm lưới an toàn khi Pusher rớt). Bấm → `/messages`.
- `/messages`: cột trái gồm ô tìm theo tên hội thoại (lọc phía client trên trang đã tải), tab All / Requests (có số), danh sách hội thoại (avatar, tên, preview, thời gian, chấm chưa đọc). Cột phải trống với lời nhắc chọn hội thoại.
- `/messages/[id]`: header (tên, số thành viên, menu), danh sách tin cuộn ngược với "tải thêm" khi lên đầu (`useInfiniteQuery` theo `before`), dòng "đang gõ", ô soạn (Enter gửi, Shift+Enter xuống dòng, một nút đính kèm nhận cả ảnh lẫn file: ảnh xem trước bằng thumbnail, file hiện thành chip có icon, tên, dung lượng và tiến độ upload; file bị từ chối báo bằng toast). Tin của mình căn phải, trạng thái `sending` / `failed` (nút thử lại) / ✓ / ✓✓.
- Thẻ file trong bubble: icon theo loại, tên (cắt bớt nếu dài), dung lượng, nút tải về; tin của mình và của người khác dùng cùng thẻ, khác màu nền như bubble.
- Hội thoại ở hộp chờ: banner "X muốn nhắn tin với bạn" + Chấp nhận / Từ chối / Chặn.
- `/messages/new?to=<publicId>`: mở hội thoại 1-1 có sẵn hoặc khung soạn trống. Nút "Nhắn tin" ở trang profile và kết quả tìm người.
- Mobile (< 768px): một cột; vào hội thoại thì ẩn danh sách, có nút quay lại.
- Render tin: `react-markdown` với `allowedElements` chỉ `p`, `br`, `code`, `pre` (tắt HTML thô, ảnh, link markdown, heading); khối code dùng `react-syntax-highlighter` như blog; URL thuần tự nhận diện, mở tab mới với `rel="noopener noreferrer nofollow"`.

## 10. Xử lý lỗi

`ApiError` + `runAction`, lỗi 5xx không lộ chi tiết.

| Tình huống | Kết quả | Client |
|---|---|---|
| Không phải thành viên, đã rời, hội thoại hoặc người nhận không tồn tại / ẩn profile | 404 | đóng hội thoại, refetch inbox |
| Bị chặn; gửi thêm khi người nhận `pending`; người nhận `declined` | 403 "Không thể gửi tin nhắn" (không nói lý do) | tin `failed`, không có thử lại |
| Body rỗng không đính kèm, > 4.000 ký tự, > 4 đính kèm, đính kèm trong hộp chờ, ảnh hoặc file sai loại/kích thước | 422 | giữ nội dung trong ô soạn; lỗi chọn file báo bằng toast |
| Nơi lưu chưa cấu hình ở production (`CLOUDINARY_*` cho ảnh, `S3_CHAT_BUCKET` cho file) | 503 | toast; phần còn lại của chat vẫn chạy |
| Sửa quá 15 phút / tin của người khác | 403 / 404 | hoàn tác |
| Vượt limiter | 429 | tin `failed`, có thử lại |
| Mất mạng / timeout | — | tin `failed`, thử lại với cùng `clientId` |
| Pusher, xoá file, Inngest lỗi sau commit | không ảnh hưởng kết quả gửi; log | dữ liệu đến qua refetch khi reconnect / focus / `refetchInterval` |

## 11. Test

Vitest, theo mẫu `__tests__/blog/*.integration.test.js`:

- `__tests__/chat/chatService.integration.test.js` (DB thật): luật hộp chờ (tin đầu, giới hạn 1 tin, không ảnh, accept, decline, tự `accepted` khi là bạn hoặc cùng team); chặn hai chiều; gửi lại cùng `clientId` ra một dòng và không fan-out lại; rời team mất quyền đọc/gửi; sửa trong/ngoài 15 phút; thu hồi xoá body và attachment; badge đếm theo hội thoại; phân trang `before` và keyset inbox; `markRead` không lùi.
- `__tests__/chat/chatActions.test.js`: quyền, limiter, validate; mock `lib/pusher.js` để kiểm tra fan-out đúng kênh, loại `socketId`, payload ≤ 8 KB inline và > 8 KB thành ping.
- `__tests__/chat/chatRoutes.test.js`: các route GET; route ảnh 302 cho thành viên, 404 cho người ngoài và người đã rời.
- `__tests__/chat/chatMedia.test.js`: `storageFor` theo env (production: ảnh → cloudinary, file → s3; dev: cả hai → s3); vé POST Cloudinary có `type: authenticated`, `public_id`, `signature` và không lộ `api_secret`; `readUrl` file có `Content-Disposition: attachment`; `inspect`/`remove` đi đúng `provider` của dòng; mock SDK `cloudinary` và S3 presigner.
- `__tests__/chat/chatAttachments.integration.test.js` thêm: file theo đuôi (pdf được, `.exe`/`.html`/`.svg` bị 422), content-type do server quyết, `file_name` được làm sạch, giới hạn 4 đính kèm tính chung, file trong hộp chờ 422.
- `__tests__/chat/chatPush.test.js`: đã đọc → không push; `pending` → không push; nội dung preview/`[code]`/`[image]`/`[file]`.
- `__tests__/admin/chatReports.integration.test.js`: chỉ trả tin bị báo cáo; `hide` thu hồi tin; cần quyền.
- E2E (`tests/_e2e`): hai tài khoản, gửi, nhận realtime, ✓✓, hộp chờ chấp nhận.

## 12. Việc cần làm ngoài code

- User tạo bucket S3 private cho chat ở production và đặt `S3_CHAT_BUCKET`; xác nhận `CLOUDINARY_*` production có quyền upload `type: authenticated` (revision 2).
- Kiểm tra `community.messages` rỗng ở production trước khi migrate (mục 3).
- Theo dõi quota message của Pusher: "đang gõ" và ✓✓ tăng số event.
- Mỗi lần xem ảnh chat production gọi API Cloudinary (`private_download_url`), không qua CDN: theo dõi quota Admin/Upload API của tài khoản; nếu cần thumbnail hoặc cache CDN có hạn thật thì phải bật token-based auth (gói trả phí của Cloudinary).

## Thay đổi trong lúc làm

- R8b: thiếu cấu hình lưu trữ chat ở production chỉ là cảnh báo; chỉ đính kèm chat trả 503, phần còn lại của site chạy bình thường (thay cho lỗi isolation ban đầu). Revision 2 giữ nguyên nguyên tắc này: thiếu `CLOUDINARY_*` → ảnh 503, thiếu `S3_CHAT_BUCKET` → file 503.
- R13/R16: đơn vị đọc là `seq`, không phải `messageId`: payload `chat-read` là `{ conversationId, userId, seq }`, `markReadAction` nhận `{ conversationId, seq }`.
- R15: lỗi validate của chat trả 422 (parser riêng `parseChat`), không phải 400 như phần còn lại của codebase.
- R17: action trả về dữ liệu rút gọn: `{ message }` (sửa, thu hồi), `{ lastReadSeq }` (đã đọc), `{ state }` (trả lời yêu cầu).
- R23: "Blocked people" là một `SettingsSection` riêng (`settings-blocked`) cạnh Privacy, không nằm trong `privacySection.jsx`.
- R25: trang `/admin/chat-reports` hiển thị dạng hàng như các danh sách admin khác, không phải bảng.
- R26: admin ẩn tin phải nhập lý do 10–500 ký tự, như các route admin khác.
- R27: tin chưa gửi được (đang gửi / lỗi) nằm trong outbox Zustand phía client theo `conversationId`, không nằm trong query cache; gửi lại dùng cùng `clientId`.
- R31: `/messages/new` tra hội thoại 1-1 sẵn có phía server (`findDirectConversationId`) và chuyển tới `/messages/<id>`; chỉ khi chưa có mới hiện khung soạn trống.
- R32: `MessageBody` không dùng `skipHtml`; HTML trong tin được hiển thị như văn bản (react-markdown không có rehype-raw nên vẫn an toàn).
- Revision 2 (2026-11-11, user yêu cầu sau khi lõi chat xong): bỏ Upstash Blob. Ảnh production lên Cloudinary `type: authenticated`, xem qua `private_download_url` có hạn 5 phút. File (tài liệu + code, ≤ 20 MB) lên S3 private ở production. Local: cả hai vào MinIO `codedev-chat-media`. Thêm migration 026 (`kind`, `provider`, `file_name`). Mục 2, 3, 4, 5, 7, 9, 10, 11, 12 đã cập nhật; chưa code (plan, phần Revision 2).
