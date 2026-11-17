# Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make /messages feel like a messenger app on desktop and phone. That covers seven areas:
- a phone-safe team dialog,
- editing in the composer,
- auto-loading of earlier messages,
- a thread that stays at the bottom while images load,
- no stray menu outline,
- a Messenger-style reply marker,
- a footer-free, keyboard-safe phone layout.

**Architecture:** Client-only changes in `components/chat/*`, `components/contact/personRow.jsx`, `components/layouts/homeLayout.jsx` and one new hook. There is one small server addition: `replyTo.senderId` in the message DTO. Edit state moves from the bubble into `conversationView`, which already owns the reply state, and is passed down to the `Composer`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (container queries built in), TanStack Query 5, Zustand, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-17-chat-polish-design.md`

## Global Constraints

- Keep the grouped-thread and filled-composer look from `df349f0b`.
- Theme tokens only, no literal colours. Icons come from `react-icons/lu`.
- Server edit rules are unchanged: `editMessage`, its time window and its errors. Errors show as a toast through the existing `fail` helper in `conversationView.jsx`.
- No change to the height or scroll of any page other than /messages.
- New copy, exactly:
  - "Editing message"
  - "Cancel edit"
  - "You replied to yourself"
  - "You replied to {name}"
  - "{name} replied to you"
  - "{name} replied to {other}"
  - "Original message was unsent"
- Tests use vitest and Testing Library, as in `__tests__/chat/*`. Run them with `npx vitest run __tests__/chat`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before Task 2: the controller runs `ui-consistency:finding-patterns` and writes `docs/superpowers/plans/2026-11-17-chat-polish.ui-checklist.md`. It covers the composer edit bar, the reply marker and the auto-load spinner.

## Review Focus

1. **Edit and reply are mutually exclusive.** Starting one clears the other, and the composer never shows both bars. Test: Task 2.
2. **A failed edit save** (for example, a 403 or 422 once the edit window has passed) shows the toast and keeps edit mode with the typed text. It does not drop the text. Test: Task 2.
3. **Switching conversation while editing** leaves edit mode, and the other conversation's composer is empty. Test: Task 2.
4. **The first page is shorter than the pane.** The top sentinel is visible at mount. Auto-load fetches the next page, never fires twice while a fetch is running, and stops when `hasNextPage` is false. Test: Task 4.
5. **The thread grows while the reader is scrolled up** (an image loads, or an older page arrives). The reader is not moved. Only a reader at the bottom is kept at the bottom. Test: Task 5.

---

### Task 1: Team dialog fits a phone; loading rows stay inside the list

**Files:**
- Modify: `components/chat/newTeamDialog.jsx` (`TeamFormContent`)
- Modify: `components/contact/personRow.jsx` (`LIST`, `PersonSkeleton`)
- Test: `__tests__/chat/teamDialogFit.test.jsx` (new)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**
  - `"TeamFormContent never runs past the screen"`: render `TeamFormContent` inside an open `Dialog`, then assert the `[data-slot=dialog-content]` className contains `max-h-[calc(100dvh-2rem)]` and `overflow-y-auto`.
  - `"loading rows size their optional columns by the list, not the screen"`: render `PersonList` with `query={{ isLoading: true, data: undefined }}`, then assert:
    - the list `ul` has `@container`;
    - no skeleton element's className contains `sm:block` or `md:block`;
    - the optional columns use `@sm:block` and `@md:block`.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/teamDialogFit.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `TeamFormContent` default `className`: `"max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"`. The precedent is `courseAdmin.jsx` `max-h-[90dvh] overflow-y-auto`.
  - `LIST` gains `@container`.
  - The two optional skeleton columns change from `sm:block` / `md:block` to `@sm:block` / `@md:block`.
  - The name skeleton keeps `max-w-full`.
- [ ] **Step 4: Run** `npx vitest run __tests__`. Expected: PASS (PersonList is shared with /contact).
- [ ] **Step 5: Commit** `fix(chat): team dialog fits a phone; loading rows stay in the list`

---

### Task 2: Edit in the composer

**Files:**
- Modify: `components/chat/composer.jsx`, `components/chat/messageBubble.jsx` (remove `EditForm` and the `editing` state), `components/chat/conversationView.jsx`
- Test: `__tests__/chat/composerEdit.test.jsx` (new). Also update `__tests__/chat/messageBubble.test.jsx` and `__tests__/chat/replyUi.test.jsx` wherever they cover the old in-thread edit form.

**Interfaces:**
- **Produces, `Composer` props** (added; existing props unchanged):
  - `editing: { id: string, body: string } | null`
  - `onSaveEdit(body: string): Promise<void>`. It rejects on failure.
  - `onCancelEdit(): void`
- **Produces, `MessageBubble`:** a new prop, `onStartEdit(message)`. The menu's Edit item calls it, and nothing else in the bubble edits.
- **`conversationView` state:** `editing`, shaped `{ conversationId, id, body } | null`.
  - Setting a reply clears `editing`, and starting an edit clears the reply.
  - Both are dropped when `conversationId` changes. Use the same `conversationId`-scoped pattern as `replyTo`.

- [ ] **Step 1: Write the failing tests** in `composerEdit.test.jsx`:
  - `"Edit puts the text in the composer under an Editing message bar, and hides Attach"`.
  - `"Enter saves through onSaveEdit and leaves edit mode; the draft typed before Edit comes back"`.
  - `"Esc and the ✕ (aria-label "Cancel edit") leave edit mode without saving and restore the draft"`.
  - `"saving unchanged or empty text calls nothing and leaves edit mode"`.
  - `"a failed save keeps edit mode and the typed text"` (Review Focus 2).
  - `"starting a reply while editing clears the edit bar, and Edit clears the reply bar"` (Review Focus 1). Render `ConversationView`, as `conversationView.test.jsx` does.
  - `"changing conversation while editing clears edit mode"` (Review Focus 3).
  - `"the bubble menu's Edit calls onStartEdit; no in-thread edit form renders"`.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/composerEdit.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Bar:** "Editing message" uses `LuPencil`. It has the same form and classes as the Replying-to bar that the merge `882341b8` added in `composer.jsx`: bordered, `bg-background dark:bg-card`.
  - **Draft:** save it in a ref when `editing` turns on, then restore it when `editing` turns off.
  - **Send:** the button keeps `aria-label="Send"` while editing.
  - **Focus:** focus moves to the textarea on entering edit mode, as Reply already does.
  - **`conversationView`:** `onSaveEdit = (body) => edit.mutateAsync({ conversationId, messageId: editing.id, body })`. On error it calls `fail`, then rethrows so the composer stays in edit mode.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): edit a message in the composer`

---

### Task 3: Browser-found glitches (flash on send, outline over Edit / Unsend)

**Step 0 is the controller's, before dispatch.** On the local dev server with two test accounts, the controller:
1. reproduces both glitches;
2. finds the element and the CSS that draw them, for example with a screen recording, frame-by-frame screenshots, or computed styles;
3. writes the cause into this task's brief as two lines: `cause:` and `fix site:`.

**Files:** the files the brief names, expected inside `components/chat/*` and `components/shadcn/dropdown-menu.jsx` / `app/globals.css`.

- [ ] **Step 1: Write the failing tests** that pin each named cause. For example: a className that must not be present while a message is sending, or a menu item whose focus style does not draw outside the item. One test per glitch, in `__tests__/chat/glitches.test.jsx`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the fix at the named site. Fix only that; if the brief's cause turns out wrong, report NEEDS_CONTEXT.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS. The controller re-checks both glitches in the browser.
- [ ] **Step 5: Commit** `fix(chat): no flash on send; menu items keep their outline inside`

---

### Task 4: Earlier messages load on scroll

**Files:**
- Modify: `components/chat/messageList.jsx`
- Test: `__tests__/chat/autoLoadEarlier.test.jsx` (new)

**Interfaces:**
- **Consumes:** `useInfiniteScroll({ hasMore, onLoadMore, isLoading, root })` from `hooks/useInfiniteScroll.js`. `root` is the scroller element: keep it in state through a callback ref so the hook re-observes once it exists.

- [ ] **Step 1: Write the failing tests.** Mock `IntersectionObserver` and capture its callback.
  - `"no Load earlier button; a sentinel at the top loads the next page when it intersects"`.
  - `"does not load again while a page is fetching, nor when hasNextPage is false"` (Review Focus 4).
  - `"keeps the reading position: scrollTop after the page arrives = new scrollHeight − saved distance from the end"`.
  - `"shows a spinner at the top while fetching, with aria-label "Loading earlier messages""`.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/autoLoadEarlier.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Replace the button with a sentinel `div` (`h-px`), followed by `<Spinner aria-label="Loading earlier messages" />` in a `flex justify-center py-2` row while `isFetchingNextPage`.
  - `onLoadMore` is the existing `loadEarlier`, which saves `fromBottom` before fetching.
  - Update the component's doc comment.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): load earlier messages on scroll`

---

### Task 5: The thread stays at the newest message while content grows

**Files:**
- Modify: `components/chat/messageList.jsx`, `components/chat/messageBubble.jsx` (single image box)
- Test: `__tests__/chat/keepBottom.test.jsx` (new)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests.** Mock `ResizeObserver` and capture its callback.
  - `"while at the bottom, a resize of the message list scrolls to the end"`.
  - `"after the reader scrolled up, a resize does not move them"` (Review Focus 5).
  - `"a single image with width and height reserves its box: style aspect-ratio "w / h""`.
  - `"an image without a size renders as today"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - One `ResizeObserver` on the message `ul`, created in an effect and disconnected on unmount. When `atBottom.current` is true, set `scrollTop = scrollHeight`.
  - A single image with a known size gets `style={{ aspectRatio: \`${width} / ${height}\` }}` and keeps `max-h-72 max-w-full`. Change its `w-auto h-auto` so the reserved box has a non-zero size before load: use `w-full` capped by `max-w-[min(100%,{width}px)]`, or an equivalent that keeps small images at their natural size. Grid tiles are unchanged, since they are already `aspect-square`.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(chat): stay at the newest message while images load`

---

### Task 6: Messenger-style reply marker

**Files:**
- Modify:
  - `db/chat.db.js`: the MESSAGE query adds `ru.public_id AS reply_sender_id`.
  - `services/chat.service.js`: `messageDto` `replyTo.senderId`.
  - `components/chat/conversationView.jsx`: `setReply` and the optimistic `replyTo` carry `senderId: m.sender?.id`.
  - `lib/chat/messageCache.js`: `refreshQuotes` keeps `senderId`.
  - `components/chat/replyQuote.jsx`.
  - `components/chat/messageBubble.jsx`: where the quote sits.
- Test: update `__tests__/chat/replyUi.test.jsx`, `__tests__/chat/chatService.integration.test.js` (the reply DTO case) and `__tests__/chat/quoteRefresh.test.js`.

**Interfaces:**
- **DTO:** `replyTo: { id, senderId, senderName, preview, deleted }`.
- **Produces:** `ReplyQuote({ replyTo, replierName, mine, meId, onJump })`.
  - `mine` means the reply is mine.
  - `replierName` is the reply sender's display name.

- [ ] **Step 1: Write the failing tests:**
  - `"the reply DTO carries replyTo.senderId (public id)"` (integration).
  - `"label: You replied to yourself / You replied to {name} / {name} replied to you / {name} replied to {other}"`. Four cases.
  - `"the quote is one button that jumps; an unsent original reads Original message was unsent"`.
  - `"the quote sits above the reply bubble on the bubble's side, and the bubble overlaps it"`. Assert the bubble wrapper has a negative top margin class, and the quote has the muted faded classes from the UI checklist.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** to the UI checklist's reply-marker line:
  - The label row is `text-xs text-muted-foreground` with `LuReply`.
  - The quote is `rounded-2xl bg-muted opacity-70`-style, with `line-clamp-2`, and is the jump button.
  - The reply bubble pulls up over the quote's bottom edge.
  - The accessible label stays `"Reply to {senderName}: {preview}, go to original"`.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): Messenger-style reply marker`

---

### Task 7: Phone layout: no footer on /messages, keyboard-safe composer

**Files:**
- Create: `hooks/useVisualViewportHeight.js`
- Modify:
  - `components/layouts/homeLayout.jsx`: omit `footer` when `usePathname()` starts with `/messages`.
  - The shell's `h-dvh` becomes `h-[var(--app-height,100dvh)]`.
  - `app/(shell)/messages/layout.jsx`: call the hook.
- Test: `__tests__/chat/phoneLayout.test.jsx` (new)

**Interfaces:**
- **Produces:** `useVisualViewportHeight(): void`.
  - While mounted, on `visualViewport` `resize`, it sets `document.documentElement.style` `--app-height` to `${Math.round(visualViewport.height)}px`.
  - On `visualViewport` `scroll` with `offsetTop > 0`, it calls `window.scrollTo(0, 0)`.
  - On unmount it removes the property and the listeners.
  - It does nothing when `window.visualViewport` is missing.

- [ ] **Step 1: Write the failing tests:**
  - `"sets --app-height from visualViewport on resize, and removes it on unmount"`.
  - `"no visualViewport: no error, no property"`.
  - `"the footer is not rendered on /messages and /messages/[id], and is rendered on /"`. Mock `usePathname`.
  - `"the shell height reads var(--app-height,100dvh)"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** to the interface above. No viewport meta change: the hook covers Android too, and a meta change would affect every page.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(chat): no footer on messages; composer stays above the keyboard`

---

### Task 8: Final checks

- [ ] **Step 1: Verify UI.**
  - `ui-consistency:verifying` by a separate agent.
  - The controller's browser checks with two accounts, at 1280×800 and 375×667:
    - edit, cancel and save in the composer;
    - no flash on send;
    - the menu outline;
    - auto-load at the top keeps your place;
    - the thread stays at the bottom while images load;
    - the reply marker in all four label cases (team for the last);
    - the team dialog at 375×667;
    - no footer on /messages.
  - The user checks keyboard behaviour on an iPhone.
- [ ] **Step 2: Docs.** Update `docs/ui-ux/INFORMATION_ARCHITECTURE.md` (Messages) and mark the spec done.
- [ ] **Step 3: Run** `npm run lint && npm test && npm run build`. Expected: PASS. Lint may show only the 13 existing `loadtest/k6` errors.
- [ ] **Step 4: Commit** `docs(chat): chat polish documentation`
