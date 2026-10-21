// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-2-3",
    title: "Responsive design: units, media & container queries",
    slug: { _type: "slug", current: "responsive-units-media-container-queries" },
    description:
        "A product card that looks right on the home page collapses into one word per line in a 300px sidebar, a Buy button hides behind the phone's toolbar, and headings ignore the user's larger font size. Learn what each CSS unit is measured against - px, rem, em, %, vw/vh and the new svh/dvh and cqi - how mobile-first media queries, clamp() and container queries work, and how to meet Resize Text and Reflow.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, outdoor-gear web shop",
        problem:
            "The redesign shipped one reusable product card and a \"Deal of the day\" page. A week later, three reports land at once. On product pages, the \"You may also like\" sidebar shows the same card with the product name broken one word per line and the price sticking out of the sidebar; desktop clicks on those cards fell from 2.8% to 0.3%. Support has 64 tickets from phone users who \"could not find the Buy button\" on the deal page. And a customer with low vision, who sets her browser's font size to Very large (24px), writes that the card text grew but the card headings did not - they are now smaller than the paragraphs under them.",
    },

    content: [
        h2("1. The incident: one card, three screens, three bugs"),
        p("This is the CSS that shipped. Each rule looked fine on the developer's 1440px monitor and in the phone preview of DevTools:"),
        code("css", `
/* product-card.css */
.card {
    display: grid;
    gap: 16px;
    padding: 16px;
}
.card h3 { font-size: 22px; }
.card p  { font-size: 1rem; }

@media (min-width: 768px) {
    .card { grid-template-columns: 220px 1fr; }   /* image left, text right */
}

/* deal.css */
.deal {
    height: 100vh;                  /* "exactly one screen" */
    display: flex;
    flex-direction: column;
}
.deal .buy { margin-top: auto; }    /* pin the Buy button to the bottom of the screen */`, "product-card.css"),
        p("None of these lines is invalid. Each bug comes from one question: **what is this size measured against?** `768px` in a media query is compared with the window, not with the card. `100vh` is a viewport height, but which one, when a phone's toolbar comes and goes? `22px` is a fixed size, while `1rem` follows the user's font setting. Predict the first bug before you read on."),
        challenge("chal_quiz_webf_231"),

        h2("2. Reproduce it"),
        p("You can see all three bugs with a desktop browser and one phone. Each check takes about a minute:"),
        numbered([
            "**The sidebar card.** Open a product page in a 1440px-wide window, open DevTools, select the sidebar card in the Elements panel and click its `grid` badge. The overlay shows a 220px column and a text column only as wide as the longest word. The Styles pane shows the `@media (min-width: 768px)` rule as active - for every card on the page.",
            "**The hidden button.** Open the deal page on a real phone. With the browser's address bar showing, the Buy button is below the visible area; it appears only after you scroll and the toolbar retracts. DevTools device mode does not show the browser's toolbars, which is why the bug looked fine in the preview.",
            "**The font setting.** In Chrome, go to Settings, Appearance, Font size and choose Very large (other browsers have the same setting under Fonts). Reload: in the Computed tab, `html` is now 24px and the card paragraphs are 24px, but the `h3` is still 22px.",
            "**Zoom and reflow.** Make the window 1280px wide and zoom to 400%. The page now has a viewport of 320 CSS pixels. Look for content cut off or a horizontal scrollbar (WCAG 1.4.10 Reflow).",
        ]),
        p("Automated checkers such as axe or Lighthouse flag a viewport meta tag that blocks zooming, but they do not resize the card, raise the font size or show a phone toolbar. Responsive bugs are found by changing the conditions and looking."),

        h2("3. The viewport meta tag and mobile-first media queries"),
        p("Without help, a mobile browser lays a page out at a desktop-sized width (980px in many mobile browsers) and shrinks the result to fit the screen. Your media queries then see that width, not the phone's. One line in the `head` tells the browser to use the device's width instead:"),
        code("html", `
<meta name="viewport" content="width=device-width, initial-scale=1">`, "index.html"),
        p("Never add `maximum-scale=1` or `user-scalable=no` to it. In browsers that honour them, they block pinch-zoom, and zoom is how many people with low vision read your page (WCAG 1.4.4 Resize Text asks that text can be resized up to 200% without losing content or functionality)."),
        p("A **media query** applies rules when a condition about the **viewport or the device** is true. Write them **mobile-first**: the base CSS is the narrow, single-column layout, and `min-width` queries add columns as the viewport grows:"),
        code("css", `
.products { display: grid; gap: 1rem; }               /* base: one column */

@media (min-width: 40em) {                            /* 640px with default settings */
    .products { grid-template-columns: repeat(2, 1fr); }
}
@media (width >= 64em) {                              /* range syntax, same idea */
    .products { grid-template-columns: repeat(3, 1fr); }
}`, "layout.css"),
        bullets([
            "**Fewer overrides.** The narrow layout needs the least CSS, so later rules only add.",
            "**Zoom users get the narrow layout for free.** At 400% zoom, a 1280px window is only 320 CSS px wide, so a mobile-first page shows its single-column layout instead of a squeezed desktop one. That is what WCAG 1.4.10 Reflow asks for: content readable at a width of 320 CSS px without scrolling in two directions.",
            "**Media queries can only see the viewport.** They are the right tool for page layout. They cannot know how wide a component's slot is - that is the incident's first bug.",
        ]),
        callout("info", "em in a media query is not your html font size",
            "Relative units in media queries are based on the initial font size - the user's default, 16px unless they change it - not on anything your stylesheet sets. Even with html { font-size: 62.5% }, (min-width: 40em) means 640px at default settings. If the user picks a 24px default, it means 960px: the layout switches to fewer columns earlier, which is exactly what large text needs."),

        h2("4. px, rem and em: who decides the size?"),
        p("Every length unit answers one question - relative to what? For text, the important difference is who can change the size:"),
        bullets([
            "**px** is a fixed CSS pixel. Browser zoom enlarges it, but the browser's font-size setting does not touch it.",
            "**rem** is the font size of the root element, `html`. If your CSS does not set that to a px value, it starts at the user's default font size, so `1rem` is 16px for most users and 24px for the customer in the incident.",
            "**em** is the current font size. In a `font-size` declaration it means the parent's font size; in every other property (padding, margin, width) it means the element's own font size. Because it is relative to the parent, it compounds: a list nested three levels deep with `font-size: 0.8em` ends at 0.8 x 0.8 x 0.8 = about 51%.",
        ]),
        code("css", `
html { font-size: 16px; }        /* avoid: overrides the user's setting for every rem */

html { font-size: 100%; }        /* fine: 100% of the user's default (also what you get with no rule) */
h3   { font-size: 1.375rem; }    /* 22px at default settings, 33px at a 24px default */
.btn { padding: 0.5em 1em; }     /* em: padding grows with the button's own text */
.card { border: 1px solid; }     /* px is right for hairlines that should not scale */`, "units.css"),
        p("The rule of thumb: **rem for font sizes and most spacing, em for things that should scale with the text right next to them, px for borders and fine details**. WCAG 1.4.4 can technically be met with browser zoom alone, but users who set a larger default font size expect every piece of text to follow it, and px headings break that expectation - as the incident's third report shows."),

        h2("5. Viewport units and the mobile toolbar"),
        p("`1vw` is 1% of the viewport's width and `1vh` is 1% of its height. On a phone, the viewport height is not one number: the browser's address bar and toolbar slide away when you scroll and come back when you scroll up. CSS defines three viewports for this:"),
        bullets([
            "**svh** - the small viewport: the height while the toolbars are shown. A `100svh` box always fits on the screen.",
            "**lvh** - the large viewport: the height with the toolbars retracted. Mobile browsers resolve plain `vh` like `lvh`, so a `100vh` box is taller than the visible area while the toolbar is shown - the Buy button sat in the part hidden under it.",
            "**dvh** - the dynamic viewport: follows the toolbars as they move. It is accurate, but the layout changes while the user scrolls, which can make content jump.",
        ]),
        p("There are matching width units (`svw`, `lvw`, `dvw`) and they are supported in all current major browsers. For a section that should fill the screen, use `min-height` rather than `height`, so the content can still grow with a larger font, and put the new unit after a fallback:"),
        code("css", `
.deal {
    min-height: 100vh;     /* fallback for older browsers */
    min-height: 100svh;    /* fits while the toolbar is shown */
}`, "deal.css"),
        callout("warning", "100vw is often wider than the page",
            "On desktops with classic scrollbars, 100vw includes the vertical scrollbar, so width: 100vw is a few pixels wider than the page and creates a horizontal scrollbar. A block element already fills its container; width: 100% (or no width at all) is usually what you want."),

        h2("6. Fluid type with clamp()"),
        p("`clamp(MIN, VAL, MAX)` returns VAL, but never less than MIN and never more than MAX. The spec defines it as `max(MIN, min(VAL, MAX))`, which also tells you what happens when MIN is larger than MAX: **MIN wins**. `min()` and `max()` take any number of arguments, and their arguments can be sums such as `1rem + 2vw` - no `calc()` needed, but the `+` and `-` must have spaces on both sides."),
        code("css", `
h1 {
    /* 2rem on phones, grows with the window, stops at 3rem */
    font-size: clamp(2rem, 1.5rem + 2vw, 3rem);
}
.page { width: min(100% - 2rem, 70rem); margin-inline: auto; }`, "type.css"),
        p("Why `1.5rem + 2vw` and not just `5vw`? Browser zoom makes every CSS pixel bigger and the viewport correspondingly narrower in CSS pixels, so a size in pure `vw` stays the same on screen: the text does not get larger when the user zooms. The `rem` part keeps growing with zoom and with the user's font setting. Keep MAX not too far above MIN, and check at 200% zoom that the text really doubles."),

        h2("7. Container queries: ask the slot, not the window"),
        p("A **container query** applies rules based on the size of an ancestor element - the **query container** - instead of the viewport. A reusable component should use it, because the component never knows where it will be placed. Two steps:"),
        numbered([
            "Make the slot a container: `container-type: inline-size` lets descendants query its width (its inline size). Give it a name with `container-name`, or use the shorthand `container: card / inline-size`.",
            "Write `@container card (min-width: 30rem) { ... }`. The rules inside apply to elements **inside** that container, when the nearest ancestor container named `card` is at least 30rem wide.",
        ]),
        code("css", `
.card-slot { container: card / inline-size; }          /* li in the grid, li in the sidebar */

.card { display: grid; gap: 1rem; padding: 1rem; }      /* base: stacked */

@container card (min-width: 30rem) {
    .card { grid-template-columns: 13.75rem 1fr; }      /* side by side only when there is room */
}
.card h3 { font-size: clamp(1.25rem, 1rem + 1.5cqi, 1.75rem); }`, "product-card.css"),
        image("media-vs-container-query", {
            alt: "Diagram comparing a media query and a container query for the same product card on a 1440px-wide window. On the left, @media (min-width: 768px) is true for the whole window, so both the card in the 600px main column and the card in the 300px sidebar use two columns, and the sidebar card's text is squeezed into a narrow column that overflows. On the right, @container card (min-width: 30rem) measures each slot: the 600px slot gets two columns, the 300px slot gets one column with the image on top. A bottom row lists what each unit is relative to: px fixed, rem the html font size, em the current font size, % a per-property basis, vw and vh the viewport, cqi the query container's width.",
            caption: "With default settings 30rem is 480px: the main slot passes, the sidebar slot does not, on any screen.",
        }),
        p("Container query units work like viewport units, but against the container: `cqi` is 1% of the query container's inline size (`cqw`, `cqh`, `cqb`, `cqmin` and `cqmax` also exist). If no ancestor is a container, they fall back to the small viewport. And unlike media queries, `em` and `rem` in a container query condition use the real computed font sizes of the page."),
        bullets([
            "**A container cannot query itself.** The rules inside `@container` style its descendants, which is why the container is the slot (`.card-slot`) and the grid is on `.card` inside it.",
            "**Elements are not containers by default.** Without `container-type` on an ancestor, an `@container` rule never matches.",
            "**The container's width must come from outside.** `inline-size` containment means the browser sizes the container as if it had no content in the inline direction. A block in normal flow or a grid item is fine; a container whose width came from its content (an inline-block, a float) can shrink to nothing.",
        ]),

        h2("8. Media features for user preferences"),
        p("Media queries do more than measure. **Media features** report the user's settings, and two of them belong in every stylesheet:"),
        code("css", `
/* Animate only for users who have not asked for less motion */
@media (prefers-reduced-motion: no-preference) {
    .card { transition: transform 200ms ease-out; }
    .card:hover { transform: translateY(-2px); }
}

/* Follow the operating system's dark mode */
:root { color-scheme: light dark; --bg: #ffffff; --text: #1e293b; }
@media (prefers-color-scheme: dark) {
    :root { --bg: #0f172a; --text: #e2e8f0; }
}
body { background: var(--bg); color: var(--text); }`, "preferences.css"),
        p("Writing motion inside `no-preference` means people with vestibular disorders, who set \"reduce motion\" in their operating system, never get it - safer than adding motion everywhere and trying to remove it later. Dark colours need the same contrast checks as light ones; lesson 3.1 shows how to compute them."),

        h2("9. Resolve lengths like the browser"),
        p("To debug a responsive layout, you need to resolve a value in your head: given this root font size, this window and this container, how many pixels is `clamp(1rem, 0.5rem + 2vw, 2rem)`? Write the function that does it, for the units in this lesson and for `clamp()`, `min()` and `max()`. The starter's comment defines the exact grammar and the context object; anything outside that grammar must be rejected, the way a browser drops an invalid declaration."),
        challenge("chal_coding_webf_232", "Handle the two shapes separately: a single LENGTH token, or a whole clamp(...), min(...) or max(...) call whose inside you split on commas, then each argument on whitespace (one token, or three with + or - in the middle). For a LENGTH, a regular expression can capture the number and the unit; then look up how many px one unit is in ctx. Check what cqi uses when ctx.container is null, apply clamp exactly as the formula in the starter says, and round once, at the very end."),

        h2("10. The fix"),
        p("The card becomes a component that adapts to its slot, the deal section fits the visible screen, and every text size follows the user's setting:"),
        code("html", `
<ul class="products">
    <li class="card-slot">
        <article class="card">
            <img src="tent.jpg" alt="" width="440" height="330">
            <div>
                <h3>Waterproof trekking tent</h3>
                <p>Two-person, 2.1 kg</p>
                <a class="buy" href="/cart/add/1042">Buy - $249</a>
            </div>
        </article>
    </li>
</ul>`, "product-card.html"),
        code("css", `
.card-slot { container: card / inline-size; }

.card {
    display: grid;
    gap: 1rem;
    padding: 1rem;
}
.card img { width: 100%; height: auto; }
.card h3 { font-size: clamp(1.25rem, 1rem + 1.5cqi, 1.75rem); }   /* rem part: follows user font and zoom */
.card p  { font-size: 1rem; }

@container card (min-width: 30rem) {
    .card { grid-template-columns: 13.75rem 1fr; }
}

.deal {
    min-height: 100vh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
}
.deal .buy { margin-top: auto; }`, "product-card.css"),
        bullets([
            "The sidebar card is now stacked on every screen, because its slot is 300px and the query asks the slot. The same card in the main column still gets two columns.",
            "With a 24px default font, 30rem becomes 720px, so the card stacks earlier - large text gets more room instead of being squeezed.",
            "The deal section is at least as tall as the small viewport, so the Buy button is visible while the toolbar is shown, and the section can still grow when the text gets larger.",
            "The heading is 20px to 28px at default settings and scales with the user's font size and zoom, so it stays larger than the paragraph under it.",
        ]),

        h2("11. Pitfalls to recognise in code review"),
        bullets([
            "**A component that switches layout with `@media`.** If a component can be placed in slots of different widths, its layout belongs in `@container`; keep media queries for page layout.",
            "**`height: 100vh` on mobile layouts.** Use `min-height` with `100svh` (after a `100vh` fallback); use `dvh` only when following the toolbar is worth the layout changes.",
            "**px font sizes, or `html { font-size: 16px }`.** Both ignore the user's default font size. Use rem, and leave `html` at 100%.",
            "**Fluid type in pure vw.** `font-size: 4vw` does not grow with zoom and can be unreadably small on phones. Use `clamp()` with a rem part in the preferred value.",
            "**`maximum-scale=1` or `user-scalable=no` in the viewport meta.** It blocks zoom where it is honoured, and automated checkers flag it.",
            "**Breakpoints that expect `em` to follow the html font size.** In media queries it never does; it follows the user's default.",
            "**Missing `container-type`.** An `@container` rule without a container above it silently never applies.",
            "**Fixed widths that break reflow.** A `width: 600px` box makes a 320 CSS px viewport scroll sideways. Prefer `max-width` or `min(100%, 600px)`.",
        ]),

        h2("12. Checklist"),
        bullets([
            "The page has `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">` and nothing that blocks zoom.",
            "Base styles are the narrow layout; media queries use `min-width` in em, and are only used for page layout.",
            "Components that live in slots of different widths use a named container (`container: card / inline-size`) and `@container` rules.",
            "Font sizes are in rem (or clamp() with a rem part); `html` has no px font size; px is used for borders and hairlines.",
            "Full-screen sections use `min-height: 100svh` with a `100vh` fallback, not `height: 100vh`.",
            "Motion is wrapped in `prefers-reduced-motion: no-preference`; dark mode colours come from `prefers-color-scheme` and pass contrast.",
            "Tested by hand: a 1280px window at 400% zoom (320 CSS px, no horizontal scrolling), 200% text with a larger default font, and a real phone with its toolbar showing.",
        ]),
    ],
});
