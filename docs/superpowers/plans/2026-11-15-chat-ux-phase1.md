# Chat UX Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đợt 1 của spec chat UX (§4): tag Friend và link hồ sơ trên `/contact`, ô soạn tin một dòng, khung chat cao hết màn, trình xem ảnh trong trang, tag Team, toast tin mới ngoài `/messages`, nút cuộn nhanh + thanh "đang gõ" nổi, Copy.

**Architecture:** Chỉ đổi giao diện và một ít dữ liệu đọc (thêm `showProfile` vào dòng bạn bè, cờ `toRequest` trong payload realtime `chat-message`). Không migration, không dependency mới. Mỗi mục là một thay đổi component riêng, test bằng Vitest + Testing Library, kiểm bằng trình duyệt ở cuối.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn (`Badge`, `Dialog`, `Button`, `DropdownMenu`, `Textarea`), sonner (`components/ui/alert.jsx`), TanStack Query 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-chat-ux-design.md` (§4, §6, §7)

## Global Constraints

- Không migration, không thêm dependency.
- Toast ẩn danh cho hộp chờ: chữ cố định "New message request", không tên, không nội dung, link `/messages?tab=requests`.
- Toast chỉ khi `document.visibilityState === "visible"` và đường dẫn hiện tại không bắt đầu bằng `/messages`; mỗi hội thoại một toast (id `chat-toast:<conversationId>`).
- Ô soạn tin: Enter gửi, Shift+Enter xuống dòng, Enter khi đang gõ IME không gửi (giữ như hiện tại); tự giãn từ 1 dòng tới tối đa 6 dòng rồi cuộn trong ô.
- Nút "↓" hiện khi cách đáy hơn `BOTTOM_SLACK` (48 px, hằng có sẵn trong `components/chat/messageList.jsx`).
- Copy chép `message.body` thô bằng `navigator.clipboard.writeText`, toast "Copied"; tin không có `body` thì không có mục Copy.
- Kiểm tra trình duyệt ở 375×667 và desktop, sáng và tối, trước khi đóng task giao diện cuối.

## Review Focus

1. Tin nhắn trong hộp chờ tới khi đang ở `/contact`: toast tuyệt đối không có tên hay preview (Task 5).
2. Đang cuộn lên đọc tin cũ thì có tin mới: không tự cuộn, nút "↓" hiện số tin mới; ở đáy thì vẫn tự cuộn như cũ (Task 6).
3. Ảnh chưa gửi (blob) và ảnh lỗi tải: trình xem vẫn mở, ảnh lỗi hiện thông báo thay vì ảnh vỡ (Task 4).
4. Gõ nhiều dòng (Shift+Enter) tới quá 6 dòng: ô ngừng giãn và cuộn bên trong, nút gửi không bị đẩy ra ngoài (Task 3).
5. Điện thoại 375 px: khung chat cao đúng phần còn lại của màn hình, ô soạn tin không bị che (Task 2).

---

### Task 1: `/contact` — tag Friend và link hồ sơ trong Friends

**Files:**
- Modify: `db/social.db.js` (`USER_COLUMNS` thêm `i.show_profile AS "showProfile"`), `services/social.service.js` (`userSummary` / payload `user` có `showProfile`), `components/contact/personRow.jsx`, `components/contact/contactPage.jsx`
- Test: `__tests__/social/contactTabs.test.jsx` (thêm), `__tests__/social/friends.integration.test.js` (thêm)

**Interfaces:**
- Produces: dòng `/api/friends`, `/api/friends/invitations` và payload `user` của `friend-updated` có `showProfile: boolean`. `PersonRow({ item, actions, index, tag })` — `tag` là node hiện cạnh tên.
- [ ] **Step 1: Write the failing tests** — `"Find people shows a Friend tag only on friends"` (dòng `friendship: "friends"` có chữ "Friend", dòng `"sent"` thì không); `"a friend with showProfile links name and avatar to /profile/<username>"`, `"without showProfile there is no link"`; integration `"listFriends rows carry showProfile"`.
- [ ] **Step 2: Run** `npx vitest run __tests__/social/contactTabs.test.jsx __tests__/social/friends.integration.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**; tag dùng `Badge` (variant như `Badge` trên tab / Team), layout hàng theo checklist UI của `/contact` (`docs/superpowers/plans/2026-11-13-friends.ui-checklist.md`).
- [ ] **Step 4: Run** — Expected: PASS; `npx vitest run __tests__/social` PASS (fixtures cache vá giữ `showProfile`).
- [ ] **Step 5: Commit** — `feat(contact): friend tag in find people and profile links in friends`

---

### Task 2: Khung chat cao hết màn

**Files:**
- Modify: `app/(shell)/messages/layout.jsx` (`min-h-[calc(100svh-3rem-6rem)]`), `components/chat/conversationView.jsx` (`PANE`), `components/chat/inbox.jsx` (cột hộp thư cùng chiều cao)
- Test: `__tests__/chat/conversationView.test.jsx` (thêm)

**Interfaces:**
- Produces: hằng `CHAT_HEIGHT` (chuỗi class) dùng chung cho layout và `PANE`, tính `100dvh` trừ navbar `h-12` và padding thực của layout (`pt-6 pb-10`, `lg:pt-10`); padding dưới của layout messages giảm để khung bám đáy.
- [ ] **Step 1: Write the failing test** — `"the conversation pane and the inbox use the shared full-height class"` (cả hai phần tử có class của `CHAT_HEIGHT`, không còn `min-h-96`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Đo** trong trình duyệt (controller làm ở Task 7): khoảng trống dưới khung ≤ 16 px ở 375×667 và 1280×800.
- [ ] **Step 6: Commit** — `feat(chat): chat pane and inbox fill the screen height`

---

### Task 3: Ô soạn tin một dòng

**Files:**
- Modify: `components/chat/composer.jsx`
- Test: `__tests__/chat/composer.test.jsx` (thêm / sửa)

**Interfaces:**
- Consumes: props của `Composer` giữ nguyên (`conversationId`, `imagesAllowed`, `optimistic`, `onSubmit`).
- [ ] **Step 1: Write the failing tests** — `"attach, message box and send sit on one row"` (cùng một phần tử cha flex-row); `"the box starts at one row and is capped at six rows"` (`rows={1}`, class `field-sizing-content` và `max-h` tương ứng 6 dòng); `"Shift+Enter adds a line, Enter sends"` (giữ test cũ); `"the send button is icon-only with an accessible name Send"`.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/composer.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; thumbnail / chip đính kèm và lỗi vẫn ở trên hàng; bộ đếm ký tự hiện trong hàng khi gần giới hạn (như cũ).
- [ ] **Step 4: Run** — Expected: PASS; `npx vitest run __tests__/chat` PASS.
- [ ] **Step 5: Commit** — `feat(chat): one-row composer`

---

### Task 4: Trình xem ảnh và Copy

**Files:**
- Create: `components/chat/imageViewer.jsx`
- Modify: `components/chat/messageBubble.jsx`
- Test: `__tests__/chat/imageViewer.test.jsx`, `__tests__/chat/messageBubble.test.jsx` (thêm)

**Interfaces:**
- Produces: `ImageViewer({ images: [{ src, alt }], index, open, onOpenChange })` — `Dialog` toàn màn, ảnh `object-contain`, nút ← → (ẩn khi chỉ một ảnh) và phím ArrowLeft / ArrowRight, đóng bằng Esc / nút, link "Open original" (`target="_blank"`, `rel="noopener noreferrer"`), ảnh lỗi tải hiện "This image could not be loaded".
- [ ] **Step 1: Write the failing tests** — `"clicking a sent image opens the viewer at that image"`; `"arrows and keys move between the message's images; one image hides the arrows"`; `"an unsent image opens the viewer with its blob preview"`; `"a broken image shows the error text"` (Review Focus 3); `"Copy writes the raw body and toasts Copied"`; `"a message without text has no Copy item"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; ảnh trong bong bóng thành `button` mở viewer thay cho `<a target="_blank">`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): in-page image viewer and copy message`

---

### Task 5: Tag Team và toast tin mới ngoài `/messages`

**Files:**
- Modify: `components/chat/conversationRow.jsx` (tag Team, icon nhóm), `components/chat/conversationView.jsx` (nhãn Team ở header), `services/chatRealtime.service.js` (payload `chat-message` theo từng người nhận có `toRequest: true` khi người nhận đang `pending`), `components/realtime/userRealtimeBridge.jsx` (toast)
- Create: `lib/chat/messageToast.js`
- Test: `__tests__/chat/messageToast.test.js`, `__tests__/chat/inbox.test.jsx` (thêm), `__tests__/chat/chatRealtime.test.js` (thêm)

**Interfaces:**
- Produces: `messageToast({ pathname, visible, meId, payload }) → null | { id, title, description, href }` — pure; `null` khi `pathname` bắt đầu bằng `/messages`, `!visible`, hoặc người gửi là mình; `toRequest` → `{ id: "chat-toast:<id>", title: "New message request", description: undefined, href: "/messages?tab=requests" }`; còn lại → title = tên team hoặc tên người gửi, description = `preview`, href = `/messages/<conversationId>`. Bridge gọi `showAlert`/`toast` với nút "Open".
- [ ] **Step 1: Write the failing tests** — `messageToast` cho từng nhánh (Review Focus 1: `toRequest` không có tên / preview trong bất kỳ trường nào); `"team conversations show a Team tag in the inbox"`; `chatRealtime`: `"a pending recipient's chat-message payload has toRequest true and the accepted one's does not"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; `npx vitest run __tests__/chat` PASS.
- [ ] **Step 5: Commit** — `feat(chat): team tag in the inbox and new-message toasts outside messages`

---

### Task 6: Cuộn nhanh và thanh "đang gõ" nổi

**Files:**
- Modify: `components/chat/messageList.jsx`, `components/chat/typingLine.jsx`
- Test: `__tests__/chat/conversationView.test.jsx` (thêm)

**Interfaces:**
- Produces: `MessageList` giữ `atBottom` như state (không chỉ ref) để hiện nút; `newSinceScroll` đếm tin của người khác đến khi không ở đáy, về 0 khi về đáy. `TypingLine({ …, floating })` — `floating` hiển thị dạng thanh nhỏ trên ô soạn tin.
- [ ] **Step 1: Write the failing tests** — `"scrolled up: a jump-to-latest button appears and scrolls to the bottom"`; `"messages that arrive while scrolled up do not move the scroll and are counted on the button"` (Review Focus 2); `"at the bottom new messages still scroll into view"`; `"while scrolled up the typing indicator floats above the composer"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; nút cuộn mượt (`scrollTo({ behavior: "smooth" })`), aria-label "Jump to latest messages".
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(chat): jump to latest and a floating typing indicator`

---

### Task 7: Kiểm tra giao diện, tài liệu, kiểm tra cuối

Trước Task 1: controller chạy `ui-consistency:finding-patterns` cho các vị trí đổi (hàng `/contact`, ô soạn tin, bong bóng tin, hàng hộp thư, header hội thoại) và ghi checklist vào `docs/superpowers/plans/2026-11-15-chat-ux-phase1.ui-checklist.md`; mỗi task giao diện làm theo checklist đó.

- [ ] **Step 1: Verify UI** — `ui-consistency:verifying` bởi agent khác; trình duyệt 375×667 và desktop, sáng và tối: tag Friend / link hồ sơ, ô soạn tin một dòng + Shift+Enter, khung đủ cao (đo theo Task 2 Step 5), trình xem ảnh, tag Team, toast ở `/contact` cho tin thường và tin hộp chờ (hai tài khoản), nút "↓" + thanh "đang gõ".
- [ ] **Step 2: Docs** — `docs/ui-ux/INFORMATION_ARCHITECTURE.md` (Messages + Contacts), spec: ghi đợt 1 đã làm.
- [ ] **Step 3: Chạy toàn bộ** — `npm run lint && npm test && npm run build`; Expected: PASS (lint chỉ còn lỗi có sẵn: `components/settings/webPushSection.jsx:33`, `loadtest/k6/*`). `npm run budget` so với `develop`: không tăng quá 2 KB.
- [ ] **Step 4: Commit** — `docs(chat): chat UX phase 1 documentation`
