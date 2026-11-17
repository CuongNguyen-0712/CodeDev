# Chat polish (after chat UX phase 2)

Status: written 2026-11-17. The user asked to go straight to the plan, and every choice here except item 2's approach is mine (marked *my call*).

## Why

Chat works, but it still feels like a web form in places. People notice:
- a dialog cut off on a phone,
- an edit box that pushes the thread around,
- a button to press for older messages,
- a thread that jumps when images load,
- a footer and a keyboard that cover the message box on a phone.

The goal is that /messages feels like a messenger app on desktop and on a phone.

## Goals

1. **New team dialog fits a phone.**
   - The dialog never runs past the screen. Its content scrolls inside it instead, and its title stays reachable.
   - The friend list's loading rows never overflow the list's border.
   - This applies to every dialog built on `TeamFormContent`: New team, Invite friends and Rename.
2. **Edit in the message box, like Messenger** (chosen by the user, option A).
   - Edit in the ⋯ menu moves the message text into the composer. An "Editing message" bar with a ✕ sits above the row.
   - Send (or Enter) saves and Esc or ✕ cancels. Nothing in the thread changes size.
   - While editing, attaching files is hidden, and Reply is cleared. Starting a reply cancels an edit.
   - The draft the user had typed before pressing Edit comes back after saving or cancelling *(my call)*.
   - Saving an unchanged or empty text does nothing and leaves edit mode.
   - The in-thread `EditForm` is removed.
   - **Flicker on send:** sending a message must not flash a frame or border anywhere: not on the composer, the bubble, or the thread. The cause is found in the browser first and fixed at its root.
3. **Earlier messages load on their own.**
   - Scrolling near the top loads the next older page. The "Load earlier" button goes away.
   - The reading position stays where it was, as it does today.
   - A small spinner shows at the top while a page loads.
   - Reuse `hooks/useInfiniteScroll`, with the thread's scroller as its root.
4. **The thread opens at the newest message and stays there while images load.**
   - Images with a known size reserve their box before they load.
   - While the reader is at the bottom, anything that grows the thread keeps them at the bottom: images without a size, fonts, code blocks.
   - A reader who has scrolled up is not moved.
5. **No stray outline over the ⋯ menu's Edit / Unsend items.** Reproduce it in the browser, find which element draws the line, and fix that element.
6. **A new reply marker, in the style of Messenger** *(my call)*:
   - Above the reply bubble, a one-line label in muted `text-xs` with a ↩ icon, aligned to the bubble's side:
     - "You replied to Name" on my reply,
     - "Name replied to you" on a reply to me,
     - "Name replied to Other" in teams.
   - Under the label, the quoted text in a muted, slightly faded bubble (`rounded-2xl`, `line-clamp-2`), which the reply bubble overlaps a little. The quote reads as the reply's background, not as a separate card.
   - The quote stays one button: click or Enter jumps to the original, with the same flash and toast as today.
   - An unsent original reads "Original message was unsent" in italics.
   - The accessible label stays as descriptive as today.
7. **Phone layout.**
   - The site footer is not shown on /messages at any width *(my call)*. Chat is a full-height app screen, and on desktop the footer was only reachable by scrolling past the chat.
   - When the on-screen keyboard opens, the composer stays above it and the thread shrinks: no page scroll and no covered input.
   - On Android Chrome this uses the viewport's `interactive-widget=resizes-content`. On iOS Safari, which ignores that, the visible height comes from `window.visualViewport`. It is applied only while /messages is open.

## Non-goals

- Arrow-up to edit your last message.
- An edit history.
- Changing the edit time window.
- A "beginning of conversation" marker.
- Virtualising the thread.
- A redesign of other dialogs, or of /contact's lists beyond the loading rows.

## Anti-goals (this fails even if it "works")

- The thread jumping when an older page or an image loads while the reader is reading higher up.
- Edit mode losing the user's unsent draft.
- The keyboard fix changing the height or scroll of any page other than /messages.

## Constraints

- Keep the grouped-thread and filled-composer look from `df349f0b`.
- Theme tokens only. Icons from `react-icons/lu`. Tests in vitest, as in `__tests__/chat`.
- Nothing about the edit rules changes on the server: `editMessage`, its window and its errors stay as they are. Errors still show as a toast.
- Real-keyboard behaviour cannot be checked in automated browsers. The user checks item 7 on their iPhone.

## Approaches

**Edit (item 2):**
- **A, in the composer** (chosen by the user): no thread reflow, works the same on a phone, and matches Messenger.
- **B, inside the bubble:** keeps your place in the thread, but long messages are awkward to edit on a phone.

**Keeping the bottom while content grows (item 4)** *(my call)*:
- **Chosen:** a `ResizeObserver` on the message list, plus reserved image boxes. It covers every source of growth.
- **Rejected:** waiting for every image's `load` event. That misses fonts and code blocks, and it delays the first paint.

**Keyboard (item 7)** *(my call)*:
- **Chosen:** a small hook that writes the visual viewport height to a CSS variable the shell reads, mounted by the messages layout only.
- **Rejected:** CSS alone (`dvh`), because iOS does not shrink it for the keyboard.

## Left to the builder

- Exact spacing of the new reply marker within the theme's 4px base.
- The spinner's size at the top of the thread.
- How `TeamFormContent` scrolls: the whole dialog, or the body between header and footer. Either works if the title stays reachable.
