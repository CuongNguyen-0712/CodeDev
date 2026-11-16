# Chat UX Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đợt 2 của spec chat UX (§5): trả lời trích dẫn, thả cảm xúc (mọi emoji, nhiều emoji mỗi người), push ẩn danh khi người lạ nhắn.

**Architecture:** Một migration (cột `reply_to_id`, bảng `chat_reaction`, cột `request_pushed_at`). Luật trong `services/chat.service.js` (gửi kèm `replyToId`, `toggleReaction`), SQL trong `db/chat.db.js` (`MESSAGE` trả thêm `replyTo` và `reactions`). Realtime: event mới `chat-reaction`; push người lạ là một Inngest function mới. Client: vá cache tin nhắn, UI trả lời / cảm xúc trong `messageBubble` và `composer`, bộ chọn emoji `frimousse` nạp lười.

**Tech Stack:** Next.js 16, PostgreSQL, Pusher, Inngest, TanStack Query 5, Zustand, shadcn (`Popover`), `frimousse` (mới, qua component `emoji-picker` của shadcn), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-chat-ux-design.md` (§5, §6, §7)

## Global Constraints

- Lỗi validate chat trả **422** (`parseChat`, như chat hiện tại); không có quyền 403; không tìm thấy 404; tin đã thu hồi 409.
- `emoji`: đúng **một grapheme** có `\p{Extended_Pictographic}` (kiểm bằng `Intl.Segmenter`), tối đa **32 byte UTF-8**; mỗi người tối đa **20 emoji khác nhau** trên một tin.
- Chỉ thành viên **`accepted`** chưa rời được thả cảm xúc; `pending` / `declined` → 403.
- `replyToId` phải cùng hội thoại và chưa thu hồi; sai → 422. Người `pending` trả lời được (gửi = chấp nhận, luật sẵn có).
- DTO tin: `replyTo: { id, senderName, preview, deleted } | null` (preview như inbox: 80 ký tự nội dung hiện tại, `[image]`, `[file]`, `[code]`; thu hồi → `deleted: true, preview: null`); `reactions: [{ emoji, count, userIds }]` theo thứ tự lần thả đầu tiên (`userIds` là public id, tối đa 5 người vì hội thoại ≤ 5 người).
- **Quyết định của plan (thay cho spec §5.2.4):** không có route `GET /api/chat/messages/[id]/reactions` — `userIds` trong DTO đủ để client biết `mine` và tên người thả (từ danh sách thành viên hội thoại).
- Event `chat-reaction` tới thành viên `accepted` chưa rời: `{ conversationId, messageId, emoji, userId, added }`.
- Thu hồi tin xóa mọi cảm xúc của nó trong cùng transaction; `chat-message-updated` mang `reactions: []`.
- Push người lạ: tiêu đề **"New message request"**, nội dung **"Someone wants to message you"**, link **`/messages?tab=requests`**; một lần mỗi (hội thoại, người nhận) nhờ `conversation_member.request_pushed_at`; không push khi người nhận đã chặn hoặc `declined`.
- Bộ chọn emoji (`frimousse`) chỉ được tải khi mở (`next/dynamic`, `ssr: false`); không có trong chunk dùng chung.
- Hàng emoji nhanh: 👍 ❤️ 😂 😮 😢 😡.

## Review Focus

1. Thả cùng emoji hai lần liên tiếp (bấm nhanh) → kết quả cuối đúng một trạng thái, đếm không âm, không lỗi khóa trùng (Task 3).
2. Trả lời một tin rồi tin gốc bị thu hồi → khung trích hiện "Message unsent", không lộ nội dung cũ (Task 2).
3. Emoji ghép (cờ, gia đình, tông da) là một grapheme hợp lệ; chuỗi hai emoji hoặc chữ thường → 422 (Task 3).
4. Người nhận đang `pending` nhận nhiều tin từ người lạ → chỉ một push (Task 4).
5. Bấm khung trích khi tin gốc chưa được tải → toast "Original message is not loaded", không cuộn sai (Task 6).

---

### Task 1: Migration 030

**Files:**
- Create: `db/migrations/20261116_030_chat_reply_reactions.sql` (số kế tiếp còn trống lúc làm — kiểm cả `develop` và nhánh khác)
- Test: `__tests__/chat/chatSchemaPhase2.integration.test.js`

**Interfaces:**
- Produces: `community.chat_message.reply_to_id bigint NULL REFERENCES community.chat_message(id) ON DELETE SET NULL`; `community.chat_reaction (message_id bigint REFERENCES community.chat_message(id) ON DELETE CASCADE, user_id bigint REFERENCES identity.users(id) ON DELETE CASCADE, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (message_id, user_id, emoji))`; `community.conversation_member.request_pushed_at timestamptz NULL`.
- [ ] **Step 1: Write the failing test** — `"reply_to_id, chat_reaction and request_pushed_at exist with their keys"` (columns / PK / FK `ON DELETE` rules via `information_schema` and `pg_constraint`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write the migration** (header như 029), `npm run db:migrate`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): migration for replies, reactions and request push`

---

### Task 2: Trả lời trích dẫn (server)

**Files:**
- Modify: `lib/validation/chat.js` (`sendMessageSchema` thêm `replyToId` tùy chọn, regex `msg_`), `services/chat.service.js` (`send`), `db/chat.db.js` (`insertMessage`, `MESSAGE` thêm `reply_to`)
- Test: `__tests__/chat/chatService.integration.test.js` (thêm), `__tests__/chat/chatSchema*.test.js` nếu có

**Interfaces:**
- Produces: `chatService.send({ …, replyToId })`; DTO `replyTo` theo Global Constraints.
- [ ] **Step 1: Write the failing tests** — `"a reply carries replyTo with the original's sender and preview"`; `"replyToId from another conversation or an unsent message is 422"`; `"a pending recipient can reply and becomes accepted"`; `"after the original is unsent, replyTo is deleted:true with preview null"` (Review Focus 2); `"an edited original shows its current text in replyTo.preview"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; `replyTo` lấy trong cùng câu `MESSAGE` (LEFT JOIN tin gốc + người gửi, không N+1).
- [ ] **Step 4: Run** — Expected: PASS; `npx vitest run __tests__/chat` PASS.
- [ ] **Step 5: Commit** — `feat(chat): quoted replies on the server`

---

### Task 3: Cảm xúc (server + realtime)

**Files:**
- Create: `lib/chat/emoji.js`
- Modify: `services/chat.service.js` (`toggleReaction`, thu hồi xóa cảm xúc), `db/chat.db.js` (`MESSAGE` thêm `reactions`, hàm thêm / bỏ), `actions/chat.actions.js` (`toggleReactionAction`), `lib/validation/chat.js`, `services/chatRealtime.service.js` (`reactionChanged`), `lib/realtime.js` (`CHAT_REACTION: "chat-reaction"`)
- Test: `__tests__/chat/emoji.test.js`, `__tests__/chat/chatReactions.integration.test.js`, `__tests__/chat/chatRealtime.test.js` (thêm), `__tests__/lists/actionsGuard.test.js` (phải vẫn PASS)

**Interfaces:**
- Produces: `isSingleEmoji(value) → boolean` (Global Constraints); `chatService.toggleReaction({ userId, messageId, emoji, socketId }) → { added, reactions }`; `toggleReactionAction({ messageId, emoji })` (limiter `rateLimiters.chatSend`, đúng hình `actionsGuard`); `chatRealtime.reactionChanged({ conversationId, messageId, emoji, userId, added, members, socketId })`.
- [ ] **Step 1: Write the failing tests** — emoji: `"👍, 👨‍👩‍👧, 🇻🇳 and 👍🏽 are single emoji; 👍👍, 'a', '' and a 33-byte string are not"` (Review Focus 3); integration: `"toggle adds then removes"`; `"two concurrent toggles of the same emoji end consistent with no error"` (Review Focus 1); `"a 21st different emoji by the same user is 422"`; `"pending, declined and non-members get 403/404"`; `"an unsent message is 409 and unsending clears its reactions"`; `"reactions in the DTO keep first-reaction order with userIds"`; realtime: `"chat-reaction goes to accepted members except the sender's socket"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; thêm bằng `INSERT … ON CONFLICT DO NOTHING`, bỏ bằng `DELETE`, đếm giới hạn 20 trong transaction đã khóa dòng thành viên.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): message reactions on the server`

---

### Task 4: Push ẩn danh cho người lạ

**Files:**
- Modify: `services/chatJobs.service.js` (gửi `chat/request.created` cho người nhận `pending`), `jobs/chat.js` (function `chatRequestPush`), `db/chat.db.js` (`markRequestPushed`), `app/api/inngest/route.js` (đăng ký function)
- Test: `__tests__/chat/chatJobs.test.js` (thêm), `__tests__/chat/chatRequestPush.integration.test.js`

**Interfaces:**
- Produces: event `chat/request.created` `{ userId, conversationId }`; `chatRequestPush` gọi `pushToUsers([userId], { title, body, link })` với chữ ở Global Constraints chỉ khi `markRequestPushed` cập nhật được dòng (`UPDATE … SET request_pushed_at = now() WHERE … AND state = 'pending' AND request_pushed_at IS NULL RETURNING`) và không có chặn.
- [ ] **Step 1: Write the failing tests** — `"a pending recipient gets chat/request.created; accepted ones get chat/message.created as before"`; `"three messages from a stranger push once"` (Review Focus 4); `"no push when the recipient declined or blocked"`; `"the push carries no name or message text"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): anonymous push for message requests`

---

### Task 5: Dữ liệu client — trả lời và cảm xúc

**Files:**
- Modify: `mutations/chat.mutation.js` (`useSendMessage` mang `replyToId`; `useToggleReaction` optimistic), `stores/chatOutboxStore.js` (tin chưa gửi giữ `replyToId` / `replyTo` xem trước), `lib/chat/messageCache.js` (`patchReaction(data, { messageId, emoji, userId, added })`), `lib/chat/realtimeHandlers.js` (`"chat-reaction"`), `components/realtime/userRealtimeBridge.jsx`
- Test: `__tests__/chat/messageCache.test.js`, `__tests__/chat/chatRealtimeHandlers.test.js`, `__tests__/chat/chatMutations.test.jsx` (thêm)

**Interfaces:**
- Produces: `patchReaction` thuần (thêm / bỏ `userId` vào `userIds`, cập nhật `count`, xóa mục khi 0, giữ thứ tự; idempotent khi event lặp); `useToggleReaction(conversationId)` → `toggle({ messageId, emoji })` optimistic, hoàn tác đúng thay đổi của nó khi lỗi; gửi lại từ outbox giữ `replyToId`.
- [ ] **Step 1: Write the failing tests** — `"patchReaction adds, removes, never goes below zero and ignores a repeated event"`; `"chat-reaction patches the loaded message and ignores unknown messages"`; `"optimistic toggle rolls back only its own change on error"`; `"a failed reply resent from the outbox keeps replyToId"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): reply and reaction data on the client`

---

### Task 6: Giao diện trả lời và cảm xúc

Trước khi giao task: controller chạy `ui-consistency:finding-patterns` cho bong bóng tin, ô soạn tin và popover, ghi `docs/superpowers/plans/2026-11-16-chat-ux-phase2.ui-checklist.md`.

**Files:**
- Create: `components/shadcn/emoji-picker.jsx` (component shadcn `emoji-picker` dựng trên `frimousse`; thêm dependency `frimousse`), `components/chat/reactionPicker.jsx`, `components/chat/replyQuote.jsx`
- Modify: `components/chat/messageBubble.jsx` (menu Reply / React; nút nhanh khi rê chuột trên desktop; khung trích; chip cảm xúc), `components/chat/composer.jsx` (thanh "Replying to …"), `components/chat/conversationView.jsx` / `messageList.jsx` (cuộn tới tin gốc + nháy viền), `package.json` / lockfile
- Test: `__tests__/chat/replyUi.test.jsx`, `__tests__/chat/reactionUi.test.jsx`

**Interfaces:**
- Consumes: Task 5 (`useToggleReaction`, `replyToId` trong gửi), DTO `replyTo` / `reactions`.
- Produces: `ReactionPicker({ onPick })` — hàng 6 emoji nhanh + nút "+" mở `EmojiPicker` nạp bằng `next/dynamic` (`ssr: false`); `ReplyQuote({ replyTo, onJump })`.
- [ ] **Step 1: Write the failing tests** — `"Reply sets the composer's replying bar and sending passes replyToId; ✕ clears it"`; `"switching conversation clears the reply; a failed send keeps it"`; `"a reply bubble shows the quote; an unsent original shows Message unsent"`; `"clicking a quote of an unloaded message toasts Original message is not loaded"` (Review Focus 5); `"React shows the 6 quick emoji; + loads the full picker lazily"`; `"chips show emoji and count, are outlined when mine, and toggle on click"`; `"a pending member sees no React action"`; `"Copy, Edit, Unsend and Report items still show as before"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** theo spec §5.3 và checklist; `frimousse` chỉ import trong file nạp động.
- [ ] **Step 4: Run** — Expected: PASS; `npx vitest run __tests__/chat` PASS.
- [ ] **Step 5: Commit** — `feat(chat): reply and reaction UI`

---

### Task 7: Kiểm tra cuối

- [ ] **Step 1: Verify UI** — `ui-consistency:verifying` bởi agent khác; trình duyệt (controller) 375×667 + desktop, hai tài khoản: trả lời, thả / bỏ cảm xúc thấy realtime ở máy kia, bộ chọn đầy đủ mở được, thu hồi tin gốc → "Message unsent".
- [ ] **Step 2: Bundle** — `npm run build`; kiểm `frimousse` không nằm trong chunk dùng chung (`grep` trong `.next/static/chunks` của các trang không phải `/messages`), ghi kết quả.
- [ ] **Step 3: Docs** — `docs/ui-ux/INFORMATION_ARCHITECTURE.md` (Messages), spec §5 ghi đã làm, ghi chú bỏ route GET reactions.
- [ ] **Step 4: Chạy toàn bộ** — `npm run lint && npm test && npm run build`; Expected: PASS (lint chỉ còn lỗi có sẵn).
- [ ] **Step 5: Commit** — `docs(chat): chat UX phase 2 documentation`

Trước deploy production: chạy migration của Task 1 (`npm run db:migrate:prod -- --yes`).
