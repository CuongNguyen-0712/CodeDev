# Profile Header, Edit Preview, Contact Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three changes:
- A profile header that fits phones and tablets.
- An edit mode that previews the change, dims the rest of the thread, and saves with a check icon.
- /contact loading rows shaped like the real rows.

**Architecture:** Client-only changes.
- **Profile header:** Tailwind classes in two profile pages.
- **Edit mode:** a draft callback from `Composer` up to `conversationView`, which passes the preview text and `editingId` down through `MessageList` to `MessageBubble`.
- **Loading rows:** a `skeleton` prop on the shared `PersonList`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, vitest + Testing Library (jsdom via `// @vitest-environment jsdom`).

**Spec:** `docs/superpowers/specs/2026-11-18-profile-edit-skeleton-design.md`

## Global Constraints

- Theme tokens only. Icons come from `react-icons/lu`.
- Keep the chat polish behaviour from `136faf9e`, at develop `7076eacc`:
  - edit/reply exclusivity
  - draft restore
  - Esc and IME handling
  - auto-load
  - keep-at-bottom
  - flash
- New copy, exactly: "Editing…" and "Save changes".
- The preview is local UI state only. It is never written to the query cache and never sent.
- Tests run with `npx vitest run <paths>`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Empty or whitespace preview text:** the bubble shows the original body, not an empty bubble. This is tested in Task 2.
2. **Leaving edit mode by any route** must clear the dimming and the preview: save, cancel, Esc, a conversation change, and the message being unsent. This is tested in Task 2.
3. **Realtime arriving while previewing:** a new message from the other member is still added, dimmed, and keep-at-bottom still works. A realtime edit of the same message does not overwrite the editor's preview. This is tested in Task 2.
4. **A very long name with no spaces** on the profile header at 375px wraps within two lines and causes no horizontal scroll. This is tested in Task 1 (classes) and checked in the browser in Task 4.
5. **The skeleton's row height** must equal the real row's height at 375px and at 1280px, within 4px. Checked in the browser in Task 4.

---

### Task 1: Profile header fits phone and tablet

**Files:**
- Modify: `components/profile/publicProfilePage.jsx` (header, around lines 56-83), `components/profile/profilePage.jsx` (`h1`, around line 402)
- Test: `__tests__/profile/profileHeader.test.jsx` (new). Mock `next-auth/react` the way the existing profile tests do.

- [ ] **Step 1: Write the failing tests**
  - `"public profile: name is text-2xl md:text-4xl with line-clamp-2 and a title of the full name"`
  - `"public profile: header is a column below md and a row from md; Message button is w-full md:w-auto"`
  - `"own profile: name uses the same size and clamp classes"`
- [ ] **Step 2: Run** `npx vitest run __tests__/profile/profileHeader.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - `header` becomes `flex flex-col gap-4 md:flex-row md:items-start`.
  - The avatar and name block go in an inner `flex min-w-0 items-start gap-4`.
  - The name `h1` becomes `line-clamp-2 text-2xl font-semibold tracking-tight break-words text-foreground md:text-4xl`, with `title={displayName}`.
  - The Message `Button` becomes `w-full md:ml-auto md:w-auto`.
  - Own profile: change the `h1` classes and add `title` the same way.
- [ ] **Step 4: Run** `npx vitest run __tests__/profile`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `fix(profile): header fits phone and tablet`.

---

### Task 2: Edit mode previews the change, dims the thread, saves with a check

**Files:**
- Modify: `components/chat/composer.jsx`, `components/chat/conversationView.jsx`, `components/chat/messageList.jsx`, `components/chat/messageBubble.jsx`
- Test: `__tests__/chat/editPreview.test.jsx` (new); update `__tests__/chat/composerEdit.test.jsx` where it asserts the Send label in edit mode

**Interfaces:**
- **`Composer`:** new prop `onEditDraftChange(body: string)`. It is called on every text change while `editing` is set, and once with the starting text when edit mode begins.
  - While editing, the submit button renders `LuCheck` with `aria-label="Save changes"`.
  - Otherwise the button renders `LuSendHorizontal` with `aria-label="Send"`.
- **`conversationView`:** new state `editDraft` (a string). It is cleared whenever `editing` is cleared. It passes `editingId = editing?.id` and `editPreview = editDraft` to `MessageList`.
- **`MessageList`:** new props `editingId` and `editPreview`.
  - Every bubble except `editingId` gets `dimmed`.
  - The `editingId` bubble gets `preview={editPreview}`.
  - When `editingId` becomes set, call `scrollIntoView({ block: "nearest" })` on that message's `li`. Use the existing reduced-motion check.
- **`MessageBubble`:** new props `dimmed` and `preview`.
  - `dimmed` adds `opacity-40 pointer-events-none transition-opacity motion-reduce:transition-none` on the `li`, plus `aria-hidden="true"`.
  - When `preview` is a string, the text bubble shows `preview.trim() ? preview : message.body`.
  - The time line is replaced by `<p>Editing…</p>`, styled `text-xs text-muted-foreground`.

- [ ] **Step 1: Write the failing tests**
  - `"typing in edit mode shows the typed text in the edited bubble; other bubbles are dimmed"`
  - `"whitespace-only draft shows the original body"` (Review Focus 1)
  - `"save, cancel, Esc, conversation change and unsend each clear dimming and preview"` (Review Focus 2)
  - `"a realtime message arriving during edit is added dimmed; a realtime edit of the edited message does not replace the preview"` (Review Focus 3)
  - `"edit mode shows a check icon labelled Save changes; normal mode shows Send"`
  - `"the preview never reaches the query cache"`: after typing, the cached message body is unchanged.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/editPreview.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(chat): edit preview, dimmed thread, check to save`.

---

### Task 3: /contact loading rows match the rows

**Files:**
- Modify: `components/contact/personRow.jsx` (`PersonList`, plus a new exported `PersonSkeletonWithActions`), `components/contact/contactPage.jsx`, `components/contact/friendsTab.jsx`, `components/contact/invitationsTab.jsx`
- Test: `__tests__/contact/personSkeleton.test.jsx` (new)

**Interfaces:**
- `PersonList({ ..., skeleton: Skeleton = PersonSkeleton })` renders `<Skeleton key={i} />` six times while loading.
- `PersonSkeletonWithActions()` mirrors `PersonRow`:
  - `li` `flex items-center gap-3 px-4 py-3`, then a `size-9` round avatar.
  - A `min-w-0 flex-1` block with a name bar `h-4` and a nickname bar `h-3`.
  - A right cluster `flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2` holding a badge pill `h-5 w-12 rounded-full` and an action row.
  - The action row holds a button bar `h-8 w-20 rounded-md` and a square `size-8 rounded-md`, which stands in for the Message button.
- Find people, Friends and Invitations pass `skeleton={PersonSkeletonWithActions}`. The friend picker does not.

- [ ] **Step 1: Write the failing tests**
  - `"PersonList renders the given skeleton while loading, and the default otherwise"`
  - `"PersonSkeletonWithActions has the PersonRow right-cluster classes"`, asserting the cluster class string.
  - `"Find people, Friends and Invitations pass the actions skeleton; the friend picker does not"`
- [ ] **Step 2: Run** `npx vitest run __tests__/contact/personSkeleton.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run** `npx vitest run __tests__`. Expected: PASS, apart from the known unrelated `buildLessonTarget` flake, if it appears.
- [ ] **Step 5: Commit** with the message `fix(contact): loading rows match the rows`.

---

### Task 4: Final checks

- [ ] **Step 1: Browser checks (controller), two accounts, 375×667 and 1280×800**
  - profile header with a long name (public and own);
  - edit preview while typing, dimming, the check icon, and every way out of edit mode;
  - /contact skeleton height against real rows (Review Focus 5), with network throttled;
  - plus `ui-consistency:verifying` by a separate agent.
- [ ] **Step 2: Docs.** Update the Messages and Profile rows in `docs/ui-ux/INFORMATION_ARCHITECTURE.md` and mark the spec done.
- [ ] **Step 3: Run** `npm run lint && npm test && npm run build`. Expected: PASS. Note that develop `7076eacc` upgraded Next, so the build's security gate should now pass.
- [ ] **Step 4: Commit** with the message `docs: profile, edit preview, contact skeleton`.
