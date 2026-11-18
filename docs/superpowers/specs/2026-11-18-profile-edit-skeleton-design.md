# Profile header, edit preview, /contact loading rows

Status: written 2026-11-18 at the user's request ("update plan"). Choices marked *my call* were made for them and can be corrected.

## Why

Three spots still look unfinished on a phone or while waiting:
- The profile header crams a very large name beside the avatar and the Message button.
- Editing a message gives no sense of what will change.
- The /contact loading rows look nothing like the rows that replace them.

## Goals

1. **Profile header on phone and tablet.** This applies to `components/profile/publicProfilePage.jsx` and, for the same look, `components/profile/profilePage.jsx`.
   - Below `md`, the name is `text-2xl`, still `break-words`, and clamped to 2 lines (`line-clamp-2`, with the full name in `title`).
   - The avatar stays beside the name. @username, Member since and the level badge share one wrapping line under it.
   - On the public profile, the Message button goes on its own row below the header, at full width (`w-full`), below `md`.
   - From `md` up, the layout stays as today: one row, name `text-4xl`, the button on the right.
   - The own profile's action row already moves below on phones, so only its name size and clamp change *(my call: keep both pages identical)*.
2. **Edit mode: overlay with a live preview** *(from the user's marked-up screenshot, 2026-11-18)*:
   - **Overlay.** While editing, a layer covers the whole thread area: the scroller and its jump button and typing bar, but not the header or the composer.
     - It is `bg-background/70 backdrop-blur-sm`, and nothing under it can be clicked.
     - Clicking the overlay outside the preview cancels the edit. Esc and the existing exits (save, a conversation change, the message being unsent) also end it.
   - **Preview in the middle.** Centred on the overlay is a card showing the message as it will look.
     - The bubble is a "mine" bubble (`bg-primary text-primary-foreground rounded-2xl`), with the same body rendering as the thread.
     - It holds the composer's current text, updated on every keystroke, and only the editor sees it.
     - Empty or whitespace text shows the original body.
     - Above the bubble is a small header row: the label "Edit message" (`text-xs text-muted-foreground`) and a ✕ button `aria-label="Cancel edit"`. The ✕ is the visible way to cancel on touch.
     - Long text scrolls inside the card, which is limited to the overlay height minus padding, so the page itself does not scroll.
   - **No "Editing message" bar** in the composer any more. The composer is just the row.
     - Attach stays hidden while editing.
     - The textarea's `aria-label` becomes "Edit message", so screen readers know the mode.
   - **Check icon.** While editing, the submit button shows `LuCheck` with `aria-label="Save changes"`. Outside edit mode it is unchanged (`LuSendHorizontal`, "Send").
3. **/contact loading rows match the rows.** The skeleton for lists whose rows have actions mirrors `PersonRow`:
   - avatar `size-9`, name line, nickname line;
   - on the right, a badge pill and an action button;
   - stacked on phones and side by side from `sm`, exactly as `PersonRow`'s right cluster does.
   This covers Find people, Friends and Invitations. The friend picker in the team dialogs keeps today's compact skeleton, because its rows have a checkbox, not actions. Swapping loading rows for real rows must not shift the list's height noticeably (row height equal within a few px).

## Non-goals

- Before/after comparison of the edit.
- Showing the preview to other people.
- Redesigning the profile body (stats, ranks, courses).
- Changing the friend picker's rows.

## Anti-goals

- The preview leaking: other members, or the cache, holding unsaved text.
- The overlay staying after edit mode ends, or blocking the composer.
- A skeleton taller or shorter than the rows it stands for, which would make the list jump when data arrives.

## Approaches

**Preview** *(my call)*:
- **Chosen:** the composer reports its draft (`onEditDraftChange`), `conversationView` keeps it in state beside `editing`, and `MessageList` renders the overlay and the preview from it.
- **Rejected:** writing the draft into the query cache. That risks the anti-goal, because the cache is shared with realtime patches.

**Overlay** *(the user's design)*: one absolute layer inside `MessageList`'s existing `relative` wrapper, which already holds the scroller, the jump button and the floating typing bar. The thread keeps its scroll position under it.

**Skeleton** *(my call)*: `PersonList` gets an optional `skeleton` prop (a row component). The /contact tabs pass the new `PersonSkeleton` with actions, and the picker keeps the default.

## Left to the builder

- The exact widths of the skeleton's name and badge bars.
- Whether the overlay fades in (`motion-safe` only) and the preview card's exact max height.
