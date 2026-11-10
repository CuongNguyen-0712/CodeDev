// Class strings and helpers shared by the blog's server and client components.
// No "use client" here: a server component must receive these as plain values.

// Action bar buttons (feed card and post page): 40px tall, 18px icons. No hover change: the bar reads
// as counts, not a toolbar, so it stays still under the pointer; keyboard focus keeps its ring.
export const BAR_BUTTON = "h-10 gap-1.5 px-2.5 text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent [&_svg:not([class*='size-'])]:size-[1.125rem]";

// Like and Comment keep their width when the count goes from none to one.
export const BAR_COUNT_BUTTON = `${BAR_BUTTON} min-w-14 justify-start`;

// Post body, and the editor preview of it: 17px on a 40rem column, headings clear of the body size.
// The heading rules select by tag: in an arbitrary variant Tailwind reads `_` as a space, so `.lesson_h2` would not match.
// The body's first block starts flush: the header above already leaves its gap, and a heading's own
// top margin on top of it made 80px of empty space.
export const READING_PROSE = "text-[1.0625rem] leading-[1.75] [&_h2]:mt-10 [&_h2]:text-2xl [&_h3]:mt-8 [&_h3]:text-xl [&_h4]:text-lg [&>div>*:first-child]:mt-0";

// A post's topic badges, on the card and on the post page: 28px, so they can be tapped.
export const TAG_BADGE = "h-7 px-2.5";

// UTC so the server and the browser print the same day.
export const formatPostDate = (value) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
