# UI checklist: chat polish (spec items 2, 3, 6)

This checklist covers three changes to the existing /messages pane: the composer's edit bar, the auto-load row at the top of the thread, and the reply marker.

- **Sizing:** whole phase, decided by the caller.
- **Family:** `components/chat/*`. This is the same family and bound as `2026-11-16-chat-ux-phase2.ui-checklist.md`, so it is not counted again.
- **References (level 3):**
  - the Replying-to bar in `composer.jsx`, from merge `882341b8`;
  - the grouped thread and filled composer in `df349f0b`;
  - `replyQuote.jsx` as it is today.
- **Theme:** shadcn tokens in `app/globals.css`, with no literal colours.
- **Dark mode:** follow `df349f0b`. The `muted` surfaces in the thread take `dark:bg-accent`, because muted is almost the card colour in dark mode.

- [ ] **Composer edit bar** (`composer.jsx`). It has the exact form of the Replying-to bar at `composer.jsx:180-187`, so there is one bar style and no second one:
  - Container: `div` with `flex items-center gap-2 rounded-2xl border bg-background py-1.5 pr-1 pl-3 text-xs dark:bg-card`.
  - Icon: `LuPencil aria-hidden className="size-3.5 shrink-0 text-muted-foreground"`.
  - Text: `<p className="min-w-0 flex-1 truncate">Editing message</p>`.
  - Cancel: `Button type="button" variant="ghost" size="icon-xs" aria-label="Cancel edit"` with `LuX`.
  - Only one bar shows at a time: Edit and Reply exclude each other.
  - While editing, the attach button is not rendered; it is not merely disabled. This is the same "not rendered" rule as the menu items.
  - The send button keeps its form and its `aria-label="Send"`.
- [ ] **Bubble menu Edit** (`messageBubble.jsx`). The Edit item stays where it is in the ⋯ menu, with `LuPencil` and the label "Edit". It calls `onStartEdit(message)`. `EditForm` and the bubble's `editing` state are removed, so no in-thread form renders.
- [ ] **Auto-load row** (`messageList.jsx`). The "Load earlier" `Button` is removed.
  - A sentinel `<div aria-hidden className="h-px" />` sits first in the scroller.
  - While `isFetchingNextPage`, a row `div.flex.justify-center.py-2` holds the project's `Spinner`. That is the same piece the composer and banners use: 5 uses in `components/chat`.
  - The spinner has `aria-label="Loading earlier messages"`.
  - Nothing renders when there are no more pages.
- [ ] **Reply marker** (`replyQuote.jsx` and its place in `messageBubble.jsx`, inside the non-deleted branch, above images and files):
  - **Label row:**
    - `p` with `flex items-center gap-1 px-3 text-xs text-muted-foreground`.
    - `LuReply aria-hidden className="size-3"`.
    - The text is one of:
      - "You replied to yourself"
      - "You replied to {name}"
      - "{name} replied to you"
      - "{name} replied to {other}"
    - The label is `aria-hidden`. The button's `aria-label` carries the meaning.
    - It sits on the bubble's side: `self-end` for mine and `self-start` for others, as the column already aligns.
  - **Quote:**
    - `button type="button"` with `max-w-full min-w-0 rounded-2xl bg-muted px-3 pt-2 pb-4 text-left text-sm text-muted-foreground opacity-80 hover:opacity-100 dark:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
    - The text uses `line-clamp-2 break-words`.
    - The quote has no border. The phase 2 bordered pill is replaced.
    - For an unsent original, the text "Original message was unsent" is `italic`.
  - **Overlap:** the reply's next piece (the text bubble, or the first image or file) carries `-mt-3 relative`, so it covers the quote's bottom padding. The quote reads as the reply's background, not as a separate card. The stacking order follows document order. No `z-[...]`.
  - **Accessible label:** unchanged, `"Reply to {senderName}: {preview}, go to original"`.
  - **Jump:** behaviour unchanged (jump, flash, and the toast when the original is not loaded).
- [ ] **Not copied, and left out:**
  - The phase 2 bordered quote pill and the EditForm's fixed-height textarea are not copied.
  - Copy style: sentence case, with no full stop on bar text and labels.
  - New copy to review: "Editing message", "Cancel edit", the four reply labels, "Original message was unsent" and "Loading earlier messages".
