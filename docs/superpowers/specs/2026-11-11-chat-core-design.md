# Chat: lõi tin nhắn 1-1 và nhóm — thiết kế

Date: 2026-11-11. Status: design (brainstorming, path: architectural). Sub-project 1/3 của "message chat" (`future-plan.txt`, `docs/development-plan.md` §3.2).

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
| D3 | Nội dung: text, khối code (```` ``` ````) được tô màu, ảnh. |
| D4 | Ảnh lưu private. Local: MinIO, bucket mới `codedev-chat-media`. Production: **Upstash Blob**, `UPSTASH_BLOB_TOKEN` (user tự cấu hình env production). |
| D5 | Giao diện: trang `/messages` (hai cột desktop, một cột mobile) + icon tin nhắn trên navbar cạnh chuông, có badge. |
| D6 | Có: đã xem (✓✓), đang gõ, sửa/thu hồi, web push khi chưa đọc. |
| D7 | Realtime: fan-out qua kênh user có sẵn (phương án A); tin lớn chỉ gửi ping, client fetch (phương án C). |

Mặc định do thiết kế này đặt (user đã duyệt cùng các phần thiết kế):

- Một tin: tối đa 4.000 ký tự, tối đa 4 ảnh, mỗi ảnh tối đa 5 MB, chỉ `image/jpeg`, `image/png`, `image/webp`.
- Sửa trong 15 phút sau khi gửi; thu hồi không giới hạn thời gian.
- Khi người nhận còn `pending`, người gửi chỉ gửi được 1 tin, không kèm ảnh.
- Push gom theo hội thoại trong 60 giây, chỉ gửi khi tin vẫn chưa đọc; tin trong hộp chờ không push.
- Admin chỉ thấy đúng tin bị báo cáo, không đọc được cả hội thoại.

Ngoài phạm vi: gọi thoại/video, file không phải ảnh, reaction, trả lời trích dẫn, tìm kiếm trong tin nhắn, tắt thông báo theo hội thoại, dock chat nổi, chỉnh sửa ảnh/thumbnail, presence online.

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

`community.messages` (bảng cũ, `id integer`, không có `client_id`, không chứa được nhóm) bị `DROP` trong cùng migration. **Điều kiện:** trước khi chạy `db:migrate:prod`, xác nhận `SELECT count(*) FROM community.messages` = 0 ở production; nếu khác 0, dừng và hỏi user.

### Luật nghiệp vụ

1. **Mở hội thoại 1-1.** A gửi tin đầu cho B (`toUserId`): upsert `conversation` theo `direct_key`. A ở `accepted`. B ở `accepted` nếu `community.friend` có cặp A–B ở `accepted` hoặc A và B cùng một team (`team_members.status = 'approved'`); ngược lại B ở `pending`. B phải bật `show_profile` và `status = 'active'`, nếu không trả 404.
2. **Hộp chờ.** Khi B còn `pending`: A chỉ có 1 tin trong hội thoại, không ảnh; B thấy hội thoại ở tab Requests; B không phát ✓✓ và "đang gõ". B chấp nhận → `accepted`. B từ chối → `declined`: hội thoại ẩn khỏi B, A không được báo, tin tiếp theo của A trả 403. B tự nhắn cho A → B về `accepted`.
3. **Chặn** áp dụng cho 1-1, theo cả hai chiều: nếu có `user_block` theo bất kỳ chiều nào thì không gửi được tin và không tạo được hội thoại mới (403). Hội thoại cũ vẫn đọc được. Chat team không bị ảnh hưởng.
4. **Team.** `ensureTeamConversation(teamId)` tạo hội thoại `team` (idempotent theo `team_id`). `syncTeamMember(teamId, userId, 'joined' | 'left')`: joined → upsert member `accepted`, `left_at = NULL`; left → `left_at = now()`. Thành viên có `left_at` không đọc, không gửi được (404).
5. **Chưa đọc.** Hội thoại chưa đọc khi có tin `id > last_read_message_id`, `sender_id <> me`, `deleted_at IS NULL`. Badge navbar = số hội thoại chưa đọc ở trạng thái `accepted` (không đếm số tin). Requests đếm riêng số hội thoại `pending`.
6. **Gửi tin tự tính là đã đọc** cho người gửi (`last_read_message_id = new id`).
7. **Sửa** chỉ người gửi, trong 15 phút từ `created_at`, chỉ `body`, đặt `edited_at`. Tin đã thu hồi không sửa được.
8. **Thu hồi** chỉ người gửi (hoặc admin qua báo cáo): `deleted_at = now()`, `body = ''`, xoá dòng attachment và file. UI hiện "Tin nhắn đã được thu hồi".
9. **Xoá tài khoản** cascade xoá tin, thành viên và chặn của người đó (giống `post_comment`). Hội thoại 1-1 còn một thành viên vẫn giữ.

## 4. Lưu ảnh

`lib/chatMedia.js` (server-only), ba hàm, chọn adapter theo env:

```js
signUpload(key, { contentType, size }) // -> { url, method: "PUT", headers }
signRead(key)                          // -> { url, expiresAt }
inspect(key)                           // -> { contentType, size } | null
remove(key)
```

- `UPSTASH_BLOB_TOKEN` có giá trị → Upstash Blob (`@upstash/blob`, dependency mới): `bucket.signedUploadUrl`, `bucket.signedReadUrl` (tối đa 10 phút), `bucket.info`, `bucket.del`. Token chỉ ở server, không bao giờ `NEXT_PUBLIC_`.
- Ngược lại → S3/MinIO qua `lib/s3.js`, bucket `S3_CHAT_BUCKET` (mặc định `codedev-chat-media`), presign PUT/GET bằng `@aws-sdk/s3-request-presigner` có sẵn, `HeadObject`, `DeleteObject`. Thêm `buckets.chat` vào `lib/storageConfig.mjs`.
- Production không được rơi về MinIO: `storageConfig` báo lỗi nếu production thiếu cả `UPSTASH_BLOB_TOKEN` lẫn `S3_CHAT_BUCKET` trên S3 thật, theo cách `isolationError` đang làm.
- `scripts/storage-sync.mjs --init` tạo bucket `codedev-chat-media` trong MinIO và đặt CORS cho `PUT` từ origin dev. `storage-sync` **không** đồng bộ bucket chat từ production (production ảnh ở Upstash).
- Key do server sinh: `chat/{conversationPublicId}/{attachmentPublicId}.{jpg|png|webp}`. Không dùng tên file của người dùng.
- Upstash không có lifecycle rule theo prefix: dọn dẹp do job (mục 8).

`.env.example`: thêm `S3_CHAT_BUCKET` và `UPSTASH_BLOB_TOKEN` (để trống, ghi chú chỉ production).

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
| `GET /api/chat/attachments/[id]` | 302 tới signed URL, `Cache-Control: private, max-age=240` (quy tắc 6: redirect) |

**Server action** (`actions/chat.actions.js`, bọc `runAction`):

| Action | Limiter |
|---|---|
| `sendMessageAction({ conversationId?, toUserId?, clientId, body, attachmentIds })` | `chatSend` 30/60s |
| `editMessageAction({ messageId, body })` | `chatSend` |
| `recallMessageAction(messageId)` | `chatSend` |
| `markReadAction({ conversationId, messageId })` | `chatRead` 120/60s |
| `typingAction(conversationId)` | `chatTyping` 30/60s |
| `respondRequestAction({ conversationId, accept })` | `chatSend` |
| `createChatUploadAction({ conversationId, contentType, size, width, height })` | `chatUpload` 20/60s |
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

**Ảnh.** (1) `createChatUploadAction` kiểm tra thành viên, không ở hộp chờ, loại và kích thước khai báo → insert `chat_attachment` (`message_id NULL`) → trả presigned PUT. (2) Trình duyệt PUT thẳng lên storage, hiện tiến độ. (3) Gửi tin kèm `attachmentIds`; server `inspect` từng file: không tồn tại, sai loại hoặc lớn hơn khai báo → 422, xoá file. (4) `<img src="/api/chat/attachments/{id}">`: route kiểm tra người xem là thành viên chưa rời, rồi 302 tới `signRead`. `width`/`height` do client báo chỉ dùng để giữ tỉ lệ khung.

**Push.** Inngest function `chat-push`, `debounce: { key: "event.data.userId + ':' + event.data.conversationId", period: "60s" }`. Khi chạy: đọc member; nếu `state = 'accepted'`, chưa rời và `last_read_message_id < messageId` → `pushToUsers([userId], { title, body, link: "/messages/{conversationPublicId}" })`. `title`: tên người gửi (1-1) hoặc tên team. `body`: preview 80 ký tự đầu nếu chỉ có 1 tin chưa đọc, ngược lại "N tin nhắn mới"; khối code thành `[code]`, ảnh thành `[ảnh]`.

**Chặn / báo cáo.** Nút trong menu hội thoại 1-1 (chặn) và menu từng tin (báo cáo). Danh sách đã chặn + bỏ chặn trong `components/settings/privacySection.jsx`. Admin `/admin/chat-reports` theo mẫu kiểm duyệt bình luận blog (`app/admin/blog/page.jsx`, `GET/PATCH /api/admin/blog/comments`): chỉ hiện tin bị báo cáo, người gửi, lý do, số báo cáo.

## 8. Job

Trong `jobs/` (Inngest):

- `chat-push` (mục 7).
- `chat-attachment-delete`: xoá file theo key, retry mặc định, hết lượt → dead-letter có sẵn.
- Cron `chat-orphan-attachments` (thêm vào `jobs/crons.js`, mỗi giờ): attachment `message_id IS NULL` và `created_at < now() - 1 hour` → xoá file rồi xoá dòng, mỗi lần tối đa 500.

## 9. Giao diện

Trước khi bắt đầu task UI đầu tiên của plan: chạy `ui-consistency:finding-patterns` để lấy checklist (component, theme, trạng thái loading/empty/error) từ các trang có sẵn như `/notifications` và blog.

- Navbar: icon tin nhắn cạnh `notificationCenter`, badge số hội thoại chưa đọc (`useQuery` `GET /api/chat/unread`, `refetchInterval` 60 giây làm lưới an toàn khi Pusher rớt). Bấm → `/messages`.
- `/messages`: cột trái gồm ô tìm theo tên hội thoại (lọc phía client trên trang đã tải), tab All / Requests (có số), danh sách hội thoại (avatar, tên, preview, thời gian, chấm chưa đọc). Cột phải trống với lời nhắc chọn hội thoại.
- `/messages/[id]`: header (tên, số thành viên, menu), danh sách tin cuộn ngược với "tải thêm" khi lên đầu (`useInfiniteQuery` theo `before`), dòng "đang gõ", ô soạn (Enter gửi, Shift+Enter xuống dòng, nút đính kèm ảnh, xem trước ảnh trước khi gửi). Tin của mình căn phải, trạng thái `sending` / `failed` (nút thử lại) / ✓ / ✓✓.
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
| Body rỗng không ảnh, > 4.000 ký tự, > 4 ảnh, ảnh trong hộp chờ, ảnh sai loại/kích thước | 422 | giữ nội dung trong ô soạn |
| Sửa quá 15 phút / tin của người khác | 403 / 404 | hoàn tác |
| Vượt limiter | 429 | tin `failed`, có thử lại |
| Mất mạng / timeout | — | tin `failed`, thử lại với cùng `clientId` |
| Pusher, xoá file, Inngest lỗi sau commit | không ảnh hưởng kết quả gửi; log | dữ liệu đến qua refetch khi reconnect / focus / `refetchInterval` |

## 11. Test

Vitest, theo mẫu `__tests__/blog/*.integration.test.js`:

- `__tests__/chat/chatService.integration.test.js` (DB thật): luật hộp chờ (tin đầu, giới hạn 1 tin, không ảnh, accept, decline, tự `accepted` khi là bạn hoặc cùng team); chặn hai chiều; gửi lại cùng `clientId` ra một dòng và không fan-out lại; rời team mất quyền đọc/gửi; sửa trong/ngoài 15 phút; thu hồi xoá body và attachment; badge đếm theo hội thoại; phân trang `before` và keyset inbox; `markRead` không lùi.
- `__tests__/chat/chatActions.test.js`: quyền, limiter, validate; mock `lib/pusher.js` để kiểm tra fan-out đúng kênh, loại `socketId`, payload ≤ 8 KB inline và > 8 KB thành ping.
- `__tests__/chat/chatRoutes.test.js`: các route GET; route ảnh 302 cho thành viên, 404 cho người ngoài và người đã rời.
- `__tests__/chat/chatMedia.test.js`: chọn adapter theo env; mock `@upstash/blob` và S3 presigner.
- `__tests__/chat/chatPush.test.js`: đã đọc → không push; `pending` → không push; nội dung preview/`[code]`/`[ảnh]`.
- `__tests__/admin/chatReports.integration.test.js`: chỉ trả tin bị báo cáo; `hide` thu hồi tin; cần quyền.
- E2E (`tests/_e2e`): hai tài khoản, gửi, nhận realtime, ✓✓, hộp chờ chấp nhận.

## 12. Việc cần làm ngoài code

- User tạo bucket Upstash Blob và đặt `UPSTASH_BLOB_TOKEN` ở production.
- Kiểm tra `community.messages` rỗng ở production trước khi migrate (mục 3).
- Theo dõi quota message của Pusher: "đang gõ" và ✓✓ tăng số event.
- Free tier Upstash Blob (10.000 lượt đọc/tháng) sẽ hết nhanh với ảnh chat; cần gói trả theo dùng.
