// Class strings and helpers shared by the blog's server and client components.
// No "use client" here: a server component must receive these as plain values.

// Action bar buttons (feed card and post page): 40px tall, 20px icons, quiet until hovered.
// hover:bg-accent, not bg-muted: in dark mode muted is almost the card colour.
export const BAR_BUTTON = "h-10 gap-2 px-3 text-muted-foreground hover:bg-accent hover:text-foreground [&_svg:not([class*='size-'])]:size-5";

// Like and Comment keep their width when the count goes from none to one.
export const BAR_COUNT_BUTTON = `${BAR_BUTTON} min-w-14 justify-start`;

// Post body, and the editor preview of it: 17px on a 40rem column, headings clear of the body size.
// The heading rules select by tag: in an arbitrary variant Tailwind reads `_` as a space, so `.lesson_h2` would not match.
export const READING_PROSE = "text-[1.0625rem] leading-[1.75] [&_h2]:mt-10 [&_h2]:text-2xl [&_h3]:mt-8 [&_h3]:text-xl [&_h4]:text-lg";

// A post's topic badges, on the card and on the post page: 28px, so they can be tapped.
export const TAG_BADGE = "h-7 px-2.5";

// UTC so the server and the browser print the same day.
export const formatPostDate = (value) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
