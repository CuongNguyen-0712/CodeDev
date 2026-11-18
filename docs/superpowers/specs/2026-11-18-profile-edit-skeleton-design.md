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
2. **Edit mode shows the change** *(my reading of "chỉ hiện thị lại review ui cho người edit khi đang nhập": the editor sees the new text in the message itself while typing)*:
   - **Live preview.** While editing, the message being edited shows the composer's current text in its bubble, for the editor only. Nothing is saved or sent until they press save.
   - **Preview marker.** The bubble carries an "Editing…" line where the time line would be. An empty or whitespace text shows the original text, and saving an empty text does nothing (unchanged rule).
   - **Overlay.** While editing, every other message in the thread is dimmed (`opacity-40`) and cannot be clicked, so the thread reads as covered. The edited message stays bright.
     - On entering edit mode, the edited message scrolls into view (`block: "nearest"`).
     - The overlay ends on save, cancel, Esc, a conversation change, and the message being unsent. These are the existing exits from edit mode.
   - **Check icon.** While editing, the send button shows `LuCheck` instead of `LuSendHorizontal`, with `aria-label="Save changes"`. Outside edit mode it is unchanged.
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
- The overlay staying after edit mode ends.
- A skeleton taller or shorter than the rows it stands for, which would make the list jump when data arrives.

## Approaches

**Preview** *(my call)*:
- **Chosen:** the composer reports its draft (`onEditDraftChange`), `conversationView` keeps it in state beside `editing`, and the bubble renders it in place of `message.body`.
- **Rejected:** writing the draft into the query cache. It is simpler to render, but it risks the anti-goal, because the cache is shared with realtime patches.

**Overlay** *(my call)*:
- **Chosen:** dim the other rows (`opacity-40 pointer-events-none`) in `MessageList` through an `editingId` prop.
- **Rejected:** a real scrim layer over the thread with the edited row lifted above it. That needs stacking contexts across the scroller and still scrolls with the list.

**Skeleton** *(my call)*: `PersonList` gets an optional `skeleton` prop (a row component). The /contact tabs pass the new `PersonSkeleton` with actions, and the picker keeps the default.

## Left to the builder

- The exact widths of the skeleton's name and badge bars.
- The transition timing of the dimming (`transition-opacity`, respecting `motion-reduce`).
