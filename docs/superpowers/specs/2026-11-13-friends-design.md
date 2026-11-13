# Bạn bè — thiết kế

Date: 2026-11-13. Status: draft. Sub-project 2/3 của "message chat" (spec lõi: `2026-11-11-chat-core-design.md` §1). Sub-project 3 (team) làm sau, spec riêng.

## 1. Mục đích

User muốn **một danh sách bạn bè để nhắn nhanh, không cần tìm lại người đó**. Bạn bè chỉ phục vụ chat:

- Hai người là bạn → tin nhắn 1-1 vào thẳng hộp thư, không qua tab Requests (chat đã làm qua `chatDb.areClose`).
- Danh sách bạn bè nằm trên `/contact`, mỗi người có nút Message.

Hiện trạng:

- `community.friend` đã có (`sender_id`, `receiver_id`, `status` ∈ `pending | accepted | rejected | cancelled`, `created_at`, `updated_at`), mỗi cặp một dòng nhờ `uq_friend_pair` trên `(LEAST, GREATEST)`, có `idx_friend_receiver`. Chưa có code ghi vào bảng.
- `/contact` (`components/contact/contactPage.jsx`, `GET /api/users` → `socialService.searchUsers` → `socialDb.getUsersSocial`) tìm người theo username, keyset `(username, id)`, mỗi dòng có nút Message (`/messages/new?to=<publicId>`). Query hiện **ẩn mọi người đã có dòng trong `community.friend`**, kể cả lời mời đang chờ.
- Thông báo: `notificationService.notify(userId, { kind, title, message, link, dedupeKey })` ghi `profile.notification` và đẩy `notification-created`; `kind` là text tự do (migration 017), unique `(user_id, kind, dedupe_key)`.
- Chặn: `chatService.block` / `unblock`, bảng `community.user_block`.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Gửi lời mời kết bạn, chấp nhận / từ chối, hủy lời mời đã gửi, hủy kết bạn.
- `/contact` có 3 tab: **Find people**, **Friends** (số bạn), **Invitations** (số lời mời nhận được đang chờ).
- Lời mời đến hiện ở chuông thông báo; được chấp nhận cũng báo lại cho người gửi.
- Tab đang mở tự cập nhật qua realtime, không cần reload.

**Không làm (lần này)**: gợi ý kết bạn, bạn chung, trạng thái online, số bạn trên hồ sơ, email / web push riêng cho lời mời, team (sub-project 3).

**Phản mục tiêu** (chạy được vẫn là hỏng):

- Kết bạn thành đường vòng qua chặn hoặc qua "Show my profile" tắt.
- Một người bị từ chối có thể spam thông báo bằng cách gửi lại liên tục.
- Người được mời biến khỏi `/contact` mà không có chỗ nào khác để thấy họ (lỗi của query hiện tại).

## 3. Cách làm đã cân nhắc

| | Cách | Đánh đổi |
|---|---|---|
| **A (đã chọn)** | Phần bạn bè riêng theo khuôn của chat: service + db + server action + route `GET` + event realtime + `notificationService` | Nhiều file hơn B, nhưng tách bạch; team (sub-project 3) đọc được bạn bè mà không đụng chat |
| B | Nhét vào `services/chat.service.js` | Ít file; file chat (~500 dòng) gánh thêm một chức năng khác hẳn |
| C | Không có lời mời: "bạn" = người có hội thoại 1-1 đã chấp nhận | Rẻ nhất, nhưng chỉ là hộp thư xếp theo người, trái luồng mời / chấp nhận đã chốt |

User chọn A (2026-11-13).

Quyết định của người viết spec: phần bạn bè nằm trong **`services/social.service.js` và `db/social.db.js`** có sẵn (đã sở hữu `/contact` và đã join `community.friend`), không tạo `friend.service.js` mới. Nếu `social.service.js` vượt ~300 dòng thì tách `services/friend.service.js`.

## 4. Dữ liệu

Giữ nguyên bảng `community.friend`, không đổi enum. Migration `20261113_027_friend_indexes.sql` thay index theo mục 7.1 (Query): hai index ghép theo người gửi / người nhận, bỏ `idx_friend_receiver` vì thành tiền tố thừa.

Ý nghĩa của một dòng (cặp A–B):

| Trạng thái | Nghĩa |
|---|---|
| không có dòng | chưa quan hệ |
| `pending` | `sender_id` đã mời `receiver_id`, chờ trả lời |
| `accepted` | là bạn |
| `rejected` | receiver đã từ chối; dòng giữ lại |
| `cancelled` | sender đã hủy lời mời; dòng giữ lại |

Hủy kết bạn **xóa dòng** (enum không có trạng thái "đã hủy kết bạn", và không cần lịch sử).

## 5. Luật

Mọi thao tác ghi chạy trong một transaction, khóa dòng của cặp (`SELECT … FOR UPDATE` theo `LEAST/GREATEST`; chưa có dòng thì `INSERT … ON CONFLICT` theo `uq_friend_pair`).

1. **Gửi lời mời** (A → B):
   - B phải tồn tại, `status = 'active'`, `show_profile = true`; không phải chính A; không có chặn theo chiều nào (`chatDb.isBlocked`). Sai → 404 cho "không tồn tại / ẩn", 403 "Can't send a friend request" cho chặn (không nói lý do, như chat).
   - Chưa có dòng → `INSERT pending (sender A, receiver B)`.
   - `pending` do A gửi → không làm gì, trả trạng thái hiện tại (idempotent).
   - `pending` do B gửi → coi như A **chấp nhận** (luật 2).
   - `accepted` → 409 "Already friends".
   - `rejected` hoặc `cancelled` → `UPDATE` thành `pending`, `sender = A`, `receiver = B`, `created_at = updated_at = now()`.
2. **Chấp nhận / từ chối**: chỉ receiver của dòng `pending`. Chấp nhận → `accepted`; từ chối → `rejected`. Dòng không còn `pending` → 409.
3. **Hủy lời mời**: chỉ sender của dòng `pending` → `cancelled`.
4. **Hủy kết bạn**: một trong hai người của dòng `accepted` → xóa dòng. Hội thoại chat giữ nguyên trạng thái.
5. **Chặn**: `chatService.block` xóa dòng của cặp (mọi trạng thái) trong cùng lần gọi. Bỏ chặn không khôi phục.
6. **Khi thành bạn** (luật 1 nhánh "B đã mời" và luật 2): nếu cặp có hội thoại 1-1 (`direct_key`) mà một thành viên đang `pending` hoặc `declined` → chuyển thành `accepted` trong cùng transaction, rồi phát `chat-conversation-updated` cho thành viên đó để hộp thư và tab Requests cập nhật.
7. **Thông báo theo từng lời mời** *(quyết định của người viết spec, sau builder check)*: `dedupeKey = <publicId người gửi>:<created_at của dòng, epoch ms>`. Mỗi lời mời mới (kể cả gửi lại sau khi bị từ chối / hủy / hủy kết bạn) báo một lần; bấm gửi lại khi đang `pending` không báo thêm (idempotent, `created_at` không đổi). Spam bị chặn bởi rate limit riêng (mục 6), và người nhận luôn có thể chặn. Thông báo cũ không bị xóa khi lời mời hết hiệu lực: chúng là lịch sử, link mở tab Invitations với trạng thái rỗng.
8. **Người kia không còn hoạt động** *(quyết định của người viết spec)*: mọi danh sách (Friends, Invitations, `/api/users`) chỉ hiện người `status = 'active'`. `show_profile` chỉ chặn việc **tìm thấy và mời mới**; bạn bè và lời mời đã có vẫn hiện dù người kia tắt "Show my profile". Trả lời / hủy / hủy kết bạn với người không còn `active` → 404; dòng friend giữ nguyên trong DB.
9. **Sau hủy kết bạn hoặc chặn** *(quyết định của người viết spec)*: hội thoại 1-1 giữ trạng thái `accepted`; hai người vẫn nhắn được nếu không có chặn (chat đã kiểm tra chặn khi gửi). Mục đích của bạn bè là bỏ qua hộp chờ một lần, không phải giấy phép nhắn tin.
10. **Thứ tự** *(quyết định của người viết spec)*: event `friend-updated`, `chat-conversation-updated` và thông báo chạy **sau commit**, best effort qua `after()` (`lib/runAfter.js`) như chat; lỗi realtime chỉ ghi log, không hoàn tác thao tác.

## 6. Bề mặt API

Theo `docs/superpowers/specs/2026-11-10-api-vs-action-boundary-design.md`: đọc qua route `GET` + React Query, ghi qua server action `runAction`. Id ra ngoài là `public_id`. Lỗi validate trả 400 như phần còn lại của codebase (khác chat).

**Server action** (`actions/social.action.js` hoặc file action có sẵn của social). Limiter **riêng** `rateLimiters.friend` (`limit: 30, windowSeconds: 60, prefix: "friend"`) trong `lib/rateLimit.js`, không dùng chung bucket `chatSend` để nhắn nhiều không làm Accept bị 429 *(quyết định của người viết spec)*:

| Action | Trả về |
|---|---|
| `sendFriendRequestAction(userId)` | `{ friendship, user }` |
| `respondFriendRequestAction({ userId, accept })` | `{ friendship, user }` |
| `cancelFriendRequestAction(userId)` | `{ friendship, user }` |
| `removeFriendAction(userId)` | `{ friendship: null, user }` |

`friendship` (từ góc nhìn người gọi): `null | "sent" | "received" | "friends"`.

**Route `GET`** (keyset theo `docs/api-conventions.md`):

| Route | Trả về |
|---|---|
| `GET /api/users?search=&cursor=` (đổi) | như cũ, thêm `friendship` mỗi dòng; **không còn ẩn** người đã có dòng friend; ẩn người có chặn theo chiều nào |
| `GET /api/friends?search=&cursor=` | bạn bè `accepted`, keyset `(username, id)`, cùng shape dòng với `/api/users` |
| `GET /api/friends/invitations?direction=received\|sent&cursor=` | lời mời `pending`, mới nhất trước, keyset `(updated_at, id)` |
| `GET /api/friends/counts` | `{ friends, received }` cho số trên tab |

**Realtime**: event mới `friend-updated` trên `private-user-{publicId}` của **cả hai** người sau mỗi thay đổi, payload `{ user, friendship, previous }` (góc nhìn người nhận event, `user` là người kia theo shape dòng của `/api/users`). `UserRealtimeBridge` vá cache theo mục 7.1, chỉ invalidate khi không vá được.

**Thông báo** (`notificationService.notify`):

| Khi | Gửi cho | `kind` | `link` | `dedupeKey` |
|---|---|---|---|---|
| Lời mời mới (luật 1) | receiver | `friend_request` | `/contact?tab=invitations` | `<publicId người gửi>:<created_at>` (luật 7) |
| Được chấp nhận | người đã gửi lời mời | `friend_accepted` | `/contact?tab=friends` | `<publicId người chấp nhận>:<created_at>` |

Không gửi thông báo khi từ chối, hủy lời mời, hủy kết bạn.

## 7. Giao diện `/contact`

Tab dùng `Tabs` của shadcn như `components/chat/inbox.jsx`; tab hiện tại nằm trong URL `?tab=find|friends|invitations` (mặc định `find`) để link từ thông báo mở đúng tab.

```
/contact
[ Find people ] [ Friends 12 ] [ Invitations 2 ]
```

- **Find people**: trang tìm hiện tại. Nút theo `friendship`:
  - `null` → **Add friend**
  - `"sent"` → **Requested** (bấm để hủy, có xác nhận)
  - `"received"` → **Accept** + **Decline**
  - `"friends"` → chỉ còn **Message**
  - Nút **Message** giữ nguyên cho mọi người như hiện tại.
- **Friends**: ô tìm theo tên + danh sách cuộn vô hạn: avatar, tên, `@username`, cấp; nút **Message**; menu ⋯ → **Unfriend** (AlertDialog xác nhận).
- **Invitations**: hai phần **Received** (Accept / Decline) và **Sent** (Cancel), mỗi phần cuộn vô hạn.
- Trạng thái rỗng dùng `Empty` viền đứt như các trang khác. Loading: skeleton như danh sách hiện tại. Lỗi: `ErrorReload`.
- Thao tác cập nhật cache ngay (optimistic) và hoàn tác khi lỗi; lỗi báo bằng toast (`showAlert`) như chat.
- Chuông thông báo: thêm icon và cách hiển thị cho `friend_request`, `friend_accepted`.

Trước task UI đầu tiên của plan: chạy `ui-consistency:finding-patterns` cho trang `/contact`.

## 7.1 Hiệu năng: rendering, cache, query

Đi theo những gì chat (Revision 3) và trang course đã làm, không thêm thư viện.

**Rendering**

- `app/(shell)/contact/page.jsx` prefetch phía server trang đầu của tab đang mở (theo `?tab=`) và `counts`, rồi bọc client bằng `HydrationBoundary`, như `app/(shell)/course/page.jsx`. Dữ liệu theo user nên phần prefetch nằm trong `Suspense` có sẵn (`cacheComponents: true`); prefetch lỗi chỉ ghi log, client tự tải lại. Kết quả: mở `/contact` thấy danh sách ngay, không chờ một vòng fetch phía client.
- Chỉ tab đang mở mới fetch (`enabled` theo tab); `TabsContent` của Radix không mount tab ẩn. `counts` là một query cho cả hai số trên tab.
- Ô tìm dùng `SearchBar` có sẵn (đã debounce) và `placeholderData: keepPreviousData` như `/api/users` hiện tại: gõ không nháy danh sách.
- Không ảo hóa danh sách: trang 10–20 dòng, cuộn vô hạn bằng `useInfiniteScroll` có sẵn. Ghi chú `shortcut:` nếu có người dùng có trên ~1.000 bạn.

**Cache (React Query)**

- Key gom dưới một gốc `keys/friend.keys.js`: `friendKeys.all`, `.list(search)`, `.invitations(direction)`, `.counts()`; Find people giữ `userKeys.users(search)`.
- Payload `friend-updated` mang **đủ dữ liệu** để vá cache tại chỗ, như chat Revision 3: `{ user: <shape dòng như /api/users>, friendship, previous }`. Hàm vá thuần trong `lib/social/friendCache.js` (có test unit, như `lib/chat/inboxCache.js`): chuyển dòng giữa Friends / Received / Sent, đổi `friendship` của dòng trong mọi trang `userKeys.users(*)`, cộng trừ `counts`. Chỉ invalidate khi không vá được (danh sách chưa tải, hoặc dòng thuộc trang chưa tải).
- Mutation optimistic dùng chính các hàm vá đó; lỗi thì hoàn tác **chỉ thay đổi của chính nó** (bài học R56 của chat), rồi invalidate `friendKeys.all`.
- Thời gian: `QUERY_TIMES.personal` (stale 30 s). Realtime giữ cache đúng nên không cần poll; mất kết nối Pusher thì focus lại cửa sổ sẽ refetch (mặc định của React Query).
- Kết bạn xong thì cập nhật dòng hội thoại trong cache chat qua `chat-conversation-updated` có sẵn (luật 6), không refetch cả inbox.

**Query (PostgreSQL)**

- Migration 027:
  - `idx_friend_receiver_state ON community.friend (receiver_id, status, updated_at DESC, id)`
  - `idx_friend_sender_state ON community.friend (sender_id, status, updated_at DESC, id)`
  - `DROP INDEX community.idx_friend_receiver` (tiền tố của index đầu).
  - Invitations theo keyset `(updated_at, id)` chạy bằng index scan, không sort.
- Tìm cặp (`uq_friend_pair` trên `LEAST/GREATEST`) đã có index; mọi điều kiện cặp viết đúng biểu thức đó để dùng được index.
- Friends: `UNION ALL` hai nhánh (`sender_id = me` / `receiver_id = me`, `status = 'accepted'`) rồi join `identity.users` + `profile.info`, keyset `(username, id)`. Nhánh dùng hai index trên; sort theo username trên tập bạn của một người (nhỏ). `shortcut:` sort trong bộ nhớ, cần index khác nếu một người có hàng nghìn bạn.
- `/api/users`: `friendship` tính bằng `CASE` trên `LEFT JOIN community.friend` sẵn có (không thêm query); loại người có chặn bằng hai `NOT EXISTS` trên `community.user_block` (khóa chính `(blocker_id, blocked_id)` và `idx_user_block_blocked` phủ cả hai chiều).
- `counts`: một câu SQL, hai `count(*)` dùng hai index ghép (chỉ đọc index khi có thể).
- Không N+1: hạng (`tier`) vẫn lấy một query cho cả trang như `searchUsers` đang làm.
- Mỗi query mới chạy `EXPLAIN (ANALYZE, BUFFERS)` trên DB local đã seed ~10.000 user, kỳ vọng index scan trên `community.friend` và `community.user_block`; kết quả ghi vào plan.

**Realtime và mạng**

- Mỗi thao tác phát tối đa 2 event `friend-updated` (một cho mỗi người), cộng `chat-conversation-updated` khi luật 6 áp dụng. Không event nào cho người thứ ba.
- Server action trả `{ friendship, user }` để người gọi vá cache mà không cần GET lại.

## 8. Lỗi

| Trường hợp | Trả | UI |
|---|---|---|
| Người kia không tồn tại, bị khóa, tắt "Show my profile" | 404 | toast |
| Có chặn theo chiều nào | 403 "Can't send a friend request" | toast |
| Đã là bạn; dòng không còn `pending` khi trả lời / hủy | 409 | toast, refetch |
| Id sai dạng | 400 | toast |
| Vượt rate limit | 429 | toast |

## 9. Test

- `__tests__/social/friends.integration.test.js` (DB thật): mọi nhánh luật 1–4; hai người mời nhau thành bạn; chặn xóa quan hệ và chặn gửi lại; thành bạn chuyển hội thoại `pending`/`declined` thành `accepted`; người ẩn hồ sơ trả 404; `/api/users` không ẩn người đã mời và có đúng `friendship`, ẩn người bị chặn; keyset của `/api/friends` và invitations; bấm gửi lại khi `pending` không tạo thông báo thứ hai, nhưng gửi lại sau khi bị từ chối thì có; người bị khóa biến khỏi Friends và trả lời họ trả 404; hủy kết bạn giữ hội thoại `accepted`.
- Test unit cho `lib/social/friendCache.js` (mọi chuyển trạng thái, counts không âm, trang chưa tải thì báo cần invalidate).
- Test unit UI cho 3 tab: nút theo `friendship`, `?tab=` mở đúng tab, xác nhận Unfriend.
- E2E tay hai tài khoản local: A mời B → B thấy chuông + tab Invitations, Accept → A thấy B ở Friends không reload → A bấm Message, tin vào thẳng hộp thư của B.

## 10. Việc ngoài code

- Chạy migration 027 trên production (`npm run db:migrate:prod -- --yes`) trước khi deploy. Migration tạo index trên bảng `community.friend` gần như rỗng nên không khóa lâu.
- Không có biến môi trường mới.

## 11. Để người làm tự quyết

- Tên file action và component con của `/contact`.
- Số dòng mỗi trang (theo mặc định của `/api/users`).
- Icon cụ thể cho hai loại thông báo.
