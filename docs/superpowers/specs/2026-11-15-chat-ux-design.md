# Chat UX: giao diện, trả lời, cảm xúc — thiết kế

Date: 2026-11-15. Status: approved 2026-11-15. Nối tiếp lõi chat (`2026-11-11-chat-core-design.md`), bạn bè (`2026-11-13-friends-design.md`) và team (`2026-11-14-teams-design.md`).

## 1. Mục đích

Đợt cải thiện do user yêu cầu sau khi dùng thử chat, bạn bè và team:

- `/contact`: Find people có tag đánh dấu bạn bè; Friends có link sang hồ sơ.
- `/messages`: ô soạn tin gọn một dòng; khung chat cao hết màn hình; xem ảnh ngay trong trang; phân biệt hội thoại team và 1-1; nút cuộn nhanh xuống tin mới, giữ dòng "đang gõ" luôn thấy.
- Toast khi có tin nhắn mà người dùng không ở `/messages`; push ẩn danh khi người lạ nhắn (hộp chờ).
- Tin nhắn: trả lời trích dẫn, thả cảm xúc (mọi emoji, mỗi người nhiều emoji trên một tin), sao chép.

## 2. Mục tiêu, không làm, phản mục tiêu

**Không làm**: ghim, chuyển tiếp, tìm trong hội thoại, sửa / thu hồi cảm xúc của người khác, trả lời lồng nhiều tầng (chỉ trích một tin), emoji tùy chỉnh / sticker, đổi thiết kế trang hồ sơ.

**Phản mục tiêu**

- Push / toast lộ tên hoặc nội dung tin của người lạ chưa được chấp nhận.
- Bộ chọn emoji làm nặng mọi trang (budget đang vượt sẵn ở `/`, `/course`, `/roadmap`, `/blog`).
- Trích dẫn để lộ nội dung tin đã thu hồi.
- Ô soạn tin một dòng mà không gõ được nhiều dòng (Shift+Enter vẫn xuống dòng, ô tự giãn tới giới hạn).

## 3. Cách làm đã cân nhắc

| Quyết định | Đã chọn | Bỏ |
|---|---|---|
| Kiểu cảm xúc | **Mọi emoji, mỗi người nhiều emoji / tin** (user chọn B) | 6 emoji cố định, mỗi người một (gọn hơn, user không chọn) |
| Bộ chọn emoji | **`frimousse` qua component `emoji-picker` của shadcn, nạp lười** (user chọn) | `emoji-picker-react` (nặng, khác kiểu shadcn); chỉ hàng emoji cố định + bàn phím OS (không đúng "mọi emoji") |
| Chia đợt | **Hai đợt, hai nhánh ngắn merge vào `develop`** (user chọn) | Một nhánh lớn |

## 4. Đợt 1 — giao diện (không đổi database)

> **Trạng thái:** đợt 1 đã làm xong (nhánh `feat/chat-ux`), gồm cả 9 mục dưới đây.

1. **Find people — tag bạn bè.** Dòng có `friendship = "friends"` hiện `Badge` "Friend" cạnh tên; `"sent"` / `"received"` giữ nút như hiện tại. Sắp lại hàng: avatar · tên + tag · cấp · nút (một hàng trên desktop, hai hàng trên 375 px).
2. **Friends — link hồ sơ.** `/api/friends` (và lời mời) trả thêm `showProfile`; tên và avatar thành link `/profile/[username]` khi `showProfile` (giống `PersonRow` ở Find people). Không đổi luật bạn bè.
3. **Ô soạn tin một dòng.** Một hàng: nút đính kèm · `Textarea` tự giãn (`field-sizing-content`, 1 dòng → tối đa ~6 dòng, rồi cuộn) · nút Gửi chỉ icon. Thumbnail / chip đính kèm hiện phía trên hàng khi có. Bộ đếm ký tự hiện khi gần giới hạn (như cũ). Enter gửi, Shift+Enter xuống dòng (như cũ).
4. **Khung chat cao hết màn hình.** Khung hội thoại và hộp thư chiếm toàn bộ chiều cao còn lại dưới navbar (`100dvh` trừ navbar và padding thực của layout), không còn khoảng trống thừa; trên điện thoại khung bám mép dưới. Đo lại bằng trình duyệt ở 375×667 và desktop.
5. **Xem ảnh trong trang.** Bấm ảnh (trong bong bóng tin, và thumbnail ảnh trong trang báo cáo admin nếu dùng chung) mở `Dialog` toàn màn hình: ảnh vừa khung, nút ← → và phím mũi tên khi tin có nhiều ảnh, Esc / nút đóng, nút "Open original" (mở URL ảnh ở tab mới như hiện tại). Ảnh chưa gửi (blob preview) cũng xem được.
6. **Phân biệt team và 1-1.** Hộp thư: hội thoại team có `Badge` "Team" cạnh tên và icon nhóm thay avatar chữ; trang hội thoại: header team có nhãn "Team". Không tách thành tab riêng (giữ All / Requests).
7. **Toast tin mới ngoài `/messages`.** Khi event `chat-message` tới và trang hiện tại không bắt đầu bằng `/messages`, tin không phải của mình: toast "Tên người gửi / tên team: preview" với nút "Open" tới `/messages/<id>`. Tin trong hộp chờ (người lạ, mình đang `pending`): toast ẩn danh "New message request" mở `/messages?tab=requests`, không tên, không nội dung. Gộp: mỗi hội thoại một toast (id theo hội thoại, toast sau thay toast trước). Chỉ toast khi tab đang hiển thị (`document.visibilityState === "visible"`); tab ẩn đã có web push lo, tránh báo hai lần *(quyết định của người viết spec)*. Chưa có khái niệm tắt tiếng hội thoại, nên không lọc theo đó.
8. **Cuộn nhanh + dòng "đang gõ".** Khi cách đáy hơn `BOTTOM_SLACK`, hiện nút tròn "↓" (kèm số tin mới đến từ lúc cuộn lên, nếu có) góc dưới khung tin; bấm cuộn mượt xuống đáy. Dòng "đang gõ" chuyển thành thanh nổi ngay trên ô soạn tin khi người đọc không ở đáy (ở đáy thì vẫn là bong bóng cuối danh sách như hiện tại).
9. **Sao chép.** Menu ⋯ của tin có "Copy" (chép `body` thô qua `navigator.clipboard.writeText`, toast "Copied"); tin không có chữ thì không hiện mục này.

## 5. Đợt 2 — trả lời, cảm xúc, push người lạ

### 5.1 Dữ liệu (migration số kế tiếp còn trống lúc làm)

- `community.chat_message.reply_to_id bigint NULL REFERENCES community.chat_message(id) ON DELETE SET NULL`; cùng hội thoại (kiểm tra ở service).
- `community.chat_reaction (message_id bigint REFERENCES community.chat_message(id) ON DELETE CASCADE, user_id bigint REFERENCES identity.users(id) ON DELETE CASCADE, emoji text NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY (message_id, user_id, emoji))`; index `(message_id)` (đã có qua PK).
- Giới hạn: `emoji` là **một grapheme emoji** (kiểm `Intl.Segmenter` + `\p{Extended_Pictographic}`), tối đa 32 byte; mỗi người tối đa **20 emoji khác nhau** trên một tin.

### 5.2 Luật

1. **Trả lời**: `sendMessage` nhận thêm `replyToId` (public id); tin được trích phải cùng hội thoại, chưa thu hồi, và người gửi đọc được; sai → 422 (chat dùng 422). Tin trả lời vẫn hiển thị khi tin gốc bị thu hồi sau đó. Người nhận đang `pending` trả lời được như gửi tin thường (gửi tin = chấp nhận, luật sẵn có của chat) *(quyết định của người viết spec)*.
2. **DTO trích dẫn**: tin có `replyTo: { id, senderName, preview, deleted }` (preview như inbox: 80 ký tự của nội dung **hiện tại** — đã sửa thì lấy bản sửa —, `[image]`, `[file]`, `[code]`); tin gốc đã thu hồi → `deleted: true`, `preview: null`. Tin gốc bị xóa hẳn (`SET NULL`) → không có `replyTo`.
3. **Cảm xúc**: `toggleReaction({ messageId, emoji })` thêm nếu chưa có, bỏ nếu đã có (của chính mình). Chỉ thành viên **`accepted`** chưa rời; người `pending` / `declined` không thả được (403, nút React ẩn với họ) — họ chấp nhận hoặc trả lời trước, giống luật "không phát ✓✓ / đang gõ khi `pending`" *(quyết định của người viết spec)*. Tin đã thu hồi không thả được (409) và cảm xúc của nó bị xóa khi thu hồi; event `chat-message-updated` của lần thu hồi mang DTO với `reactions: []` nên client tự xóa chip.
4. **DTO cảm xúc**: tin có `reactions: [{ emoji, count, mine }]` theo thứ tự lần thả đầu tiên; danh sách người thả xem qua `GET /api/chat/messages/[id]/reactions?emoji=` (tooltip / popover, tối đa 50 tên).
5. **Realtime**: event mới `chat-reaction` tới các thành viên `accepted` chưa rời: `{ conversationId, messageId, emoji, userId, added }`; client vá `reactions` của tin trong cache (đếm, `mine` khi `userId` là mình). Trả lời đi cùng event `chat-message` có sẵn (DTO đã có `replyTo`).
6. **Push người lạ**: hiện `chat/message.created` chỉ được gửi cho người nhận `accepted`. Gửi thêm event `chat/request.created` cho người nhận đang `pending`; một Inngest function riêng gửi push ẩn danh **một lần mỗi (hội thoại, người nhận)**: tiêu đề "New message request", nội dung "Someone wants to message you", link `/messages?tab=requests`; không tên, không nội dung. Dedupe bằng cột mới `conversation_member.request_pushed_at timestamptz NULL` (đặt khi push; không reset — người `declined` không nhận thêm tin vì luật chat trả 403, người đã chặn không nhận tin). Người nhận đã chặn hoặc `declined`: không push *(quyết định của người viết spec)*.

### 5.3 Giao diện

- Menu ⋯ của tin: **Reply · React · Copy** (+ Edit / Unsend / Report như cũ). Rê chuột (desktop) hiện hàng nút nhanh 😊 và ↩ cạnh bong bóng.
- **Reply**: ô soạn tin hiện thanh "Replying to Tên: preview ✕" phía trên hàng; gửi kèm `replyToId`. Trạng thái trả lời nằm trong ô soạn tin của từng hội thoại: xóa khi đổi hội thoại hoặc gửi thành công, giữ khi gửi lỗi; outbox gửi lại giữ `replyToId` *(quyết định của người viết spec)*. Bong bóng tin trả lời có khung trích nhỏ phía trên nội dung; bấm khung cuộn tới tin gốc nếu đã tải (nháy viền), không thì toast "Original message is not loaded".
- **React**: popover gồm hàng 6 emoji hay dùng + nút "+" mở bộ chọn `frimousse` (nạp lười bằng `next/dynamic`, chỉ tải khi mở). Dưới bong bóng: chip `emoji count` (viền khi `mine`), bấm chip để thả / bỏ emoji đó.
- Trạng thái lỗi bằng toast như chat.

## 6. Hiệu năng

- `frimousse` và dữ liệu emoji chỉ tải khi mở bộ chọn; đo `npm run budget` so với `develop`: không tăng quá 2 KB ở các trang đang đo.
- Trang tin nhắn: `reactions` và `replyTo` lấy trong cùng câu SQL danh sách tin (aggregate trên `chat_reaction`, join tin gốc), không N+1.
- Cache: event `chat-reaction` vá đúng tin trong các trang đã tải của `chatKeys.messages`; không refetch.

## 7. Test

- Đợt 1: unit UI cho từng mục (tag Friend, link hồ sơ theo `showProfile`, composer một dòng + Shift+Enter, lightbox ←→/Esc, tag Team, toast ngoài `/messages` và toast ẩn danh cho request, nút "↓" + thanh "đang gõ" khi cuộn lên, Copy). Kiểm tra trình duyệt 375 px + desktop, sáng + tối; đo chiều cao khung.
- Đợt 2: integration (DB thật) cho `replyToId` (cùng hội thoại, sau thu hồi), `toggleReaction` (thêm / bỏ, 20 emoji, emoji không hợp lệ 422, tin thu hồi 409, người ngoài 404), DTO `replyTo` / `reactions`, push người lạ chỉ một lần và ẩn danh; unit cho vá cache `chat-reaction`; E2E hai tài khoản.

## 8. Việc ngoài code

- Đợt 2 có migration: chạy trên production trước khi deploy.
- Đợt 2 thêm dependency `frimousse` (cài qua shadcn `emoji-picker`).

## 9. Để người làm tự quyết

- Icon, câu chữ toast / nhãn, vị trí chính xác nút "↓".
- Cách dedupe push người lạ (cột cờ hay bảng / key), miễn đúng luật 5.2.6.
