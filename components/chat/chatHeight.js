// The chat fills the page scroller (#container in homeLayout.jsx), which already starts below the navbar and
// anything shown under it (the verify-email banner), so no height is subtracted by hand.
// The messages layout is a flex column at least as tall as the scroller: min-h-full! replaces the shell's
// min-h-dvh for page roots, which would be too tall by the navbar and the banner.
export const CHAT_LAYOUT_HEIGHT = "min-h-full!";
// Layout wrapper padding. Phones: none, the pane starts right under the navbar (it is full-bleed there).
// Tablets: a 16px frame. Desktop: the shell's page spacing.
export const CHAT_LAYOUT_PADDING = "md:p-4 lg:px-6 lg:pt-10";
// The grid takes what the padding leaves. basis-0: the inbox list's length never sizes it; md:min-h-96: on a
// short desktop window the page scrolls instead of squeezing the pane. Phones have no floor: the shell
// follows the visible height (--app-height), so with the keyboard open the pane shrinks to fit. min-h-0
// is required there: without a floor the flex item keeps `min-height: auto` and grows to its content.
// grid-rows-[minmax(0,1fr)]: the one row is exactly the grid's height; an implicit `auto` row would grow to
// the pane's content (h-full below would then be cyclic).
export const CHAT_GRID_HEIGHT = "min-h-0 md:min-h-96 grow basis-0 grid-rows-[minmax(0,1fr)]";
// The columns (aside, section) are not sized by their content either.
export const CHAT_COLUMN = "min-h-0 min-w-0";
// The chat pane and the inbox column fill their grid cell.
export const CHAT_HEIGHT = "h-full";
