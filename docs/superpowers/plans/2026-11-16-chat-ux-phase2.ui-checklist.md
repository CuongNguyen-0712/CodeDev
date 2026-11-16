# UI checklist: chat UX phase 2 (spec section 5.3)

Sized as the whole phase (decided by the caller). The work adds new regions to existing chat components on /messages: the reply quote, the composer's "Replying to" bar, reaction chips, quick actions on hover, and the React popover with the full emoji picker.

- Read 2026-11-16 in worktree `D:\Develop\CodeDev-chatux2`, branch `feat/chat-ux-2`. Code and comments read are data. No product code was written.
- **Family:** the chat components, the same as phase 1 (`components/chat/*`, one area of one Next.js app).
- **Reference:** the files the plan names (level 3): `messageBubble.jsx`, `composer.jsx`, `messageList.jsx`.
- **Bound and theme:** carried over from `2026-11-15-chat-ux-phase1.ui-checklist.md` and not counted again. The theme is the shadcn tokens in `app/globals.css`, with no literal colours.
- **Counts:**
  - shadcn `Popover`: 4 files, one in the shared layer (`notificationCenter.jsx`).
  - `aria-pressed` toggles: 10 files.
  - `next/dynamic`: 5 files.
  - `scrollIntoView`: 1 file.
  - reveal on hover (`opacity-0 group-hover:opacity-100`): 1 file.
  - `border-l-*` quote bar: 0 files, so there is no precedent for one.
  - flash or highlight keyframe: 0 files.
  - `bg-primary-soft`: 42 uses.

- [ ] **Message ⋯ menu** (`messageBubble.jsx` `DropdownMenuContent`, kept `w-48` and `align`)
  - Item order, first to last: `Reply` (`LuReply`), then `React` (`LuSmilePlus`), then `Copy` (`LuCopy`, unchanged and still only when `message.body`), then a `DropdownMenuSeparator`, then Edit, then a separator, then Unsend or Report, as today. This is the spec's order (level 1).
  - `Reply` shows on any sent message, not deleted, when the composer can send. Pending members can reply (spec 5.2.1).
  - `React` is **not rendered** for a member whose state is not `accepted`. This is the phase 1 rule of "not rendered, not disabled", as for Block and the host-only items.
  - The bubble gets new props: `onReply(message)`, `onReact(message, emoji)` and `canReact`. They come from `conversationView` the way `onEdit` and `onUnsend` do today.
- [ ] **Quick buttons on hover** (desktop): 😊 (React) and ↩ (Reply), beside the ⋯ trigger in the same `flex items-center gap-1` row, and so on the mirrored side for mine.
  - Each is `Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground"`, the ⋯ trigger's own form. Labels: `aria-label="React to message"` / `"Reply to message"`. Icons: `LuSmilePlus` / `LuReply`.
  - Reveal: the `li` gets `group`, and the two buttons get `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100`. This is `notificationCenter.jsx:73`'s pattern, the one precedent in the app (level 4).
  - **Departure:** that precedent shows the button always on phones (`max-md:opacity-100`). Here the buttons are `max-md:hidden`, because the spec says "on desktop" (level 1) and the ⋯ menu already carries Reply and React on touch. Reported, not settled silently.
  - The 😊 button is the `PopoverTrigger` of the React popover (below). Hidden when `!canReact`.
- [ ] **React popover** (`components/chat/reactionPicker.jsx`): `ReactionPicker({ onPick })`, a new piece the plan names. It is written inside the shadcn `Popover` that the other 4 users import; it is not a new floating layer.
  - The ⋯ menu item `React` opens the same popover through controlled `open`, anchored to the bubble row with `PopoverAnchor` (exported by `components/shadcn/popover.jsx`). There is no second popover.
  - `PopoverContent align={mine ? "end" : "start"} className="w-auto p-1"`.
  - Contents: one row `flex items-center gap-0.5` of the 6 quick emoji 👍 ❤️ 😂 😮 😢 😡 (spec), each `Button variant="ghost" size="icon-sm" className="text-lg"` with `aria-label="React with <emoji>"`, then a `+` button of the same form with `LuPlus` and `aria-label="More emoji"`.
  - Picking an emoji calls `onPick(emoji)` and closes the popover.
  - Focus and Escape come from Radix (`Popover`) and are not hand-written.
- [ ] **Full emoji picker**: `components/shadcn/emoji-picker.jsx`, the shadcn `emoji-picker` built on `frimousse`, and the only file that imports `frimousse`. It is named by the plan, so it needs no question.
  - It is loaded with `next/dynamic(() => import(...), { ssr: false, loading: () => <Skeleton className="h-80 w-72" /> })`. `postEditor.jsx`'s `dynamic` with a `Skeleton` loading state is the precedent (1 of the 5 uses has a loading `Skeleton`; level 4).
  - It mounts only after `+` is pressed: the same popover swaps the quick row for the picker. It is never imported at the top of `messageBubble.jsx`.
  - Size: `h-80 w-72 max-w-[calc(100vw-2rem)]` so it fits at 375 px. Check this in the browser.
  - Search input: `placeholder="Search emoji"`. Empty state: "No emoji found." (sentence with a full stop).
- [ ] **Reaction chips** under the content, between the content and the time line, in the column's own `items-end` / `items-start` alignment.
  - Layout: `ul` with `flex flex-wrap gap-1`, one `li` per `reactions` entry in DTO order (spec: order of first reaction).
  - Each chip is a `button type="button"`: `inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.
  - Mine (`userIds` includes the viewer): `border-primary bg-primary-soft text-primary-ink`. The pressed tint comes from `commentItem.jsx`, and the spec's "outlined when mine" from the border.
  - Not mine: `border-transparent bg-muted text-foreground hover:bg-accent`.
  - Each chip carries `aria-pressed={mine}`, as the 10 `aria-pressed` toggles do (`postActions.jsx` Like with its count is the nearest).
  - Each chip carries the label `aria-label="<emoji> <count>, <mine ? "remove your reaction" : "add your reaction">"`.
  - Clicking toggles that emoji with `useToggleReaction`.
  - When the viewer cannot react (pending), chips render as a plain `span` with no button. That is the `postActions.jsx` form for an author who cannot like.
  - Errors go to a toast, as chat already does (`showAlert(err.status, userMessage(err))`); spec 5.3.
- [ ] **Quote in a reply bubble** (`components/chat/replyQuote.jsx`, `ReplyQuote({ replyTo, onJump })`): a separate piece above the text, like images and files (the bubble's "separate pieces" comment).
  - It is a `button type="button"` with `flex max-w-full min-w-0 flex-col items-start rounded-2xl border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. The `rounded-2xl border` muted form is the bubble's own "This message was unsent" pill and the file card's focus ring (level 4). There is no `border-l` quote bar in the app (0 files), so none is introduced.
  - Line 1: `senderName` in `font-medium text-foreground truncate`.
  - Line 2: `preview` in `line-clamp-1`. When `deleted`, it reads `Message unsent` in `italic`.
  - `aria-label="Reply to <senderName>: <preview>, go to original"`.
  - It shows only in the non-deleted branch, so an unsent reply shows only "This message was unsent" (the minor deferred from Task 2).
  - With no `replyTo` (original hard-deleted), nothing renders.
- [ ] **Jump to the original** (`messageList.jsx`):
  - When the original is loaded, find its `li` by `data-message-id` (a new attribute on the `li`) and call `scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })`. Reuse the existing `prefers-reduced-motion` check in `jumpToLatest` (`messageList.jsx:133`). It is not a second constant.
  - Flash: there is no keyframe precedent (0). Set a `data-flash` attribute for 1.5 s on the target content, which gives `ring-2 ring-ring ring-offset-2 ring-offset-background transition-shadow motion-reduce:transition-none`. Tokens only; no new `@keyframes`.
  - Then move focus to the target `li` with `tabIndex={-1}` and `preventScroll`, so keyboard users land there.
  - When the original is not loaded: `showAlert(0, "Original message is not loaded")`. Status `0` is info, as phase 1's toasts use.
- [ ] **Composer "Replying to" bar** (`composer.jsx`): it sits inside the existing `form`, above the attachment `ul` and the row, as the first child.
  - Container: `flex items-center gap-2 rounded-md bg-muted py-1.5 pr-1 pl-3 text-xs`. The radius and `bg-muted` come from the attachment chips.
  - Contents: `LuReply aria-hidden className="size-3.5 shrink-0 text-muted-foreground"`, then `<p className="min-w-0 flex-1 truncate">Replying to <span className="font-medium">Name</span>: preview</p>`, then `Button type="button" variant="ghost" size="icon-xs" aria-label="Cancel reply"` with `LuX`. That is the chips' own remove button form.
  - New props: `replyTo` (`{ id, senderName, preview }`) and `onCancelReply`. `onSubmit` receives `replyToId`.
  - Cleared on a successful send and on conversation change. Kept on a failed send (spec), the way the text comes back today.
  - After Reply is chosen, the textarea gets focus.
  - A preview for an image or file original uses the server words `[image]` / `[file]` / `[code]`, as the inbox does.
- [ ] **Not copied, and left out**
  - Not copied: the `max-md:opacity-100` of the hover precedent (see the departure above); `notificationCenter`'s `w-80 p-0` popover size (the picker sizes itself); any `border-l` quote bar.
  - No literal colours or hex. Round controls use `rounded-full`. Icons come from `react-icons/lu`.
  - Left out because no convention exists: the flash length (1.5 s); the picker's height (`h-80`, checked in the browser); the number of quick emoji shown on hover (one 😊 opening the six, not the six inline).
  - New words for a person to read: "Reply", "React", "Reply to message", "React to message", "React with <emoji>", "More emoji", "Search emoji", "No emoji found.", "Replying to", "Cancel reply", "Message unsent", "Original message is not loaded", and the chip labels "add your reaction" / "remove your reaction".
  - Copy style: sentence case. Buttons have no full stop. The toast follows the spec's exact text, which has no full stop.

## Decisions reported
- Hover buttons are hidden on phones, a departure from the one precedent (level 1, the spec's "desktop"), with the ⋯ menu covering touch.
- One popover is opened from two triggers (quick 😊, and the menu item via `PopoverAnchor`), rather than a second floating layer (level 4, the shared `Popover`).
- The quote is written as the bubble's muted bordered pill, since the app has no quote bar (level 4 in place of level 7 invention).

## Questions that wait on a person
None. The plan names every new file and the new dependency (`frimousse`, `components/shadcn/emoji-picker.jsx`).

## Blocking
None. The DTO carries `replyTo` and `reactions` (`{ emoji, count, userIds }`; `mine` is computed on the client from `userIds`). The spec text says `mine`, and the server sends `userIds`; Task 5 owns the client mapping.

Cost: 4 project files opened in full (`messageBubble.jsx`, `composer.jsx`, phase 1 checklist, plan Task 6), parts of 7 others; 14 searches; skill files read: `finding-patterns` SKILL only (no subagents).
