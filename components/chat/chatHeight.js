// The chat fills the page scroller (#container in homeLayout.jsx), which already starts below the navbar and
// anything shown under it (the verify-email banner), so no height is subtracted by hand.
// The messages layout is a flex column at least as tall as the scroller: min-h-full! replaces the shell's
// min-h-dvh for page roots, which would be too tall by the navbar and the banner.
export const CHAT_LAYOUT_HEIGHT = "min-h-full!";
// Layout wrapper padding.
export const CHAT_LAYOUT_PADDING = "pt-6 md:px-6 md:pb-4 lg:pt-10";
// The grid takes what the padding leaves. basis-0: the inbox list's length never sizes it; min-h-96: on a
// very short screen (a phone held sideways) the page scrolls instead of squeezing the pane.
// grid-rows-[minmax(0,1fr)]: the one row is exactly the grid's height; an implicit `auto` row would grow to
// the pane's content (h-full below would then be cyclic).
export const CHAT_GRID_HEIGHT = "min-h-96 grow basis-0 grid-rows-[minmax(0,1fr)]";
// The columns (aside, section) are not sized by their content either.
export const CHAT_COLUMN = "min-h-0 min-w-0";
// The chat pane and the inbox column fill their grid cell.
export const CHAT_HEIGHT = "h-full";
