// One height for the chat pane, the inbox column and the messages layout grid. 100dvh follows mobile
// browser bars and the keyboard. Subtracted: navbar h-12 (3rem) + the messages layout's top padding
// (pt-6 = 1.5rem, lg:pt-10 = 2.5rem) + its bottom padding (pb-4 = 1rem). Keep in sync with layout.jsx.
// Written out in full so Tailwind sees both classes.
export const CHAT_HEIGHT = "h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-6.5rem)] min-h-96";
