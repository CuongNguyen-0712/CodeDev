// One height for the chat pane, the inbox column and the messages layout grid. 100dvh follows the
// browser's dynamic toolbars (not the on-screen keyboard). Subtracted: navbar h-12 (3rem) + the messages
// layout's top padding (pt-6 = 1.5rem, lg:pt-10 = 2.5rem) + its bottom padding (none below md, md:pb-4 = 1rem).
// Keep in sync with layout.jsx. Written out in full so Tailwind sees every class.
export const CHAT_HEIGHT = "h-[calc(100dvh-4.5rem)] md:h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-6.5rem)] min-h-96";
// Layout wrapper padding the height above is derived from.
export const CHAT_LAYOUT_PADDING = "pt-6 md:px-6 md:pb-4 lg:pt-10";
