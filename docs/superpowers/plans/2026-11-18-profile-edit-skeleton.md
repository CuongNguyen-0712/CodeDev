# Profile Header, Edit Preview, Contact Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three changes:
- A profile header that fits phones and tablets.
- An edit mode that covers the thread with an overlay, previews the change in its centre, and saves with a check icon.
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
- New copy, exactly: "Edit message", "Cancel edit" and "Save changes".
- The preview is local UI state only. It is never written to the query cache and never sent.
- Tests run with `npx vitest run <paths>`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Empty or whitespace preview text:** the bubble shows the original body, not an empty bubble. This is tested in Task 2.
2. **Leaving edit mode by any route** must remove the overlay and the preview: save, cancel, Esc, a conversation change, and the message being unsent. This is tested in Task 2.
3. **Realtime arriving while previewing:** a new message from the other member is still added under the overlay, and keep-at-bottom still works. A realtime edit of the same message does not overwrite the editor's preview. This is tested in Task 2.
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

### Task 2: Edit mode: overlay over the thread, live preview in the middle, check to save

**Files:**
- Create: `components/chat/editPreview.jsx` (`EditPreview`)
- Modify:
  - `components/chat/composer.jsx`: remove the Editing bar; add the draft callback, the check icon and the textarea label.
  - `components/chat/conversationView.jsx`
  - `components/chat/messageList.jsx`
- Test: `__tests__/chat/editPreview.test.jsx` (new). Also update `__tests__/chat/composerEdit.test.jsx` wherever it expects the "Editing message" bar, the bar's "Cancel edit" button, or the Send label in edit mode.

**Interfaces:**
- **`Composer`:**
  - The Editing bar is gone.
  - New prop `onEditDraftChange(body: string)`. Call it with the starting text when edit mode begins, then on every change while `editing` is set.
  - While editing, the textarea has `aria-label="Edit message"`, and the submit button renders `LuCheck` with `aria-label="Save changes"`.
  - Esc and IME handling are unchanged.
- **`conversationView`:**
  - New state `editDraft` (a string). Clear it whenever `editing` is cleared.
  - Pass `editing={editing && { id: editing.id, body: editing.body, draft: editDraft }}` and `onCancelEdit` to `MessageList`.
- **`EditPreview({ original, draft, onCancel })`:**
  - The overlay: `absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm`. A click on the overlay itself, not on the card, calls `onCancel`.
  - The card: `w-full max-w-sm`. It holds a header row and the bubble.
  - The header row: "Edit message" (`text-xs text-muted-foreground`) and a ✕ `Button variant="ghost" size="icon-xs" aria-label="Cancel edit"`.
  - The bubble: `rounded-2xl bg-primary px-3 py-2 text-primary-foreground`, rendering `<MessageBody body={draft.trim() ? draft : original} />` inside `max-h-[60%] overflow-y-auto`.
- **`MessageList`:**
  - New props: `editing` and `onCancelEdit`.
  - When `editing` is set, render `<EditPreview>` as a sibling of the scroller inside the existing `relative` wrapper, after the jump button so it covers that button.
  - While editing, the scroller gets `aria-hidden="true"` and `inert`.

- [ ] **Step 1: Write the failing tests:**
  - `"edit mode covers the thread with an overlay and shows the typed text in a centred preview bubble"`
  - `"whitespace-only draft previews the original body"` (Review Focus 1)
  - `"the composer has no Editing message bar; textarea is labelled Edit message; submit shows a check labelled Save changes; normal mode shows Send"`
  - `"clicking the overlay, the preview's ✕, Esc, save, conversation change and unsend each remove the overlay"` (Review Focus 2)
  - `"clicking inside the preview card does not cancel"`
  - `"a realtime message arriving during edit is added under the overlay; a realtime edit of the edited message does not replace the preview"` (Review Focus 3)
  - `"the preview never reaches the query cache"`: after typing, the cached message body is unchanged.
- [ ] **Step 2: Run** `npx vitest run __tests__/chat/editPreview.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `npx vitest run __tests__/chat`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(chat): edit overlay with live preview, check to save`.

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
  - edit overlay and centred live preview while typing, the check icon, no Editing bar, and every way out of edit mode;
  - /contact skeleton height against real rows (Review Focus 5), with network throttled;
  - plus `ui-consistency:verifying` by a separate agent.
- [ ] **Step 2: Docs.** Update the Messages and Profile rows in `docs/ui-ux/INFORMATION_ARCHITECTURE.md` and mark the spec done.
- [ ] **Step 3: Run** `npm run lint && npm test && npm run build`. Expected: PASS. Note that develop `7076eacc` upgraded Next, so the build's security gate should now pass.
- [ ] **Step 4: Commit** with the message `docs: profile, edit preview, contact skeleton`.
