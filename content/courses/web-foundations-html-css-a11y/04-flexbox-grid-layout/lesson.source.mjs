// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-2-2",
    title: "Flexbox & Grid: picking the right layout",
    slug: { _type: "slug", current: "flexbox-grid-picking-the-right-layout" },
    description:
        "A product listing scrolls sideways on phones because one long product name widens a 1fr column, and on desktop the last row shows two giant cards. Learn when to use Flexbox and when to use Grid, how fr, minmax() and auto-fill size tracks, why min-width: auto makes layouts overflow, how logical properties follow the writing direction, and why visual order must not break reading and focus order.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, outdoor gear web shop",
        problem:
            "The redesigned search results page went live on Tuesday. By Thursday there are 46 support tickets from phone users who say the page \"slides sideways\" and the Add to cart buttons are cut off - every one on a search that returns the power bank named PWRBANK20000MAHUSBCPD65WBLACKEDITION. The accessibility audit for a public-sector customer fails the page on 1.4.10 Reflow at 320 CSS px and on 2.4.3 Focus Order, and the marketing lead posts a desktop screenshot where the last row shows two cards 588px wide next to rows of 220px cards.",
    },

    content: [
        h2("1. The incident: one page, three layout bugs"),
        p("This is the layout that shipped. A grid places the filters next to the results, a wrapping flex container lays out the product cards, and a media query switches to one column on phones and moves the filters below the results:"),
        code("html", `
<div class="listing">
  <aside class="filters" aria-label="Filters">
    <!-- 14 checkboxes: brand, capacity, price ... -->
  </aside>
  <ul class="product-list">
    <li class="product-card">
      <h2>PWRBANK20000MAHUSBCPD65WBLACKEDITION</h2>
      <p class="price">$49.00</p>
      <button type="button">Add to cart</button>
    </li>
    <!-- 11 more cards -->
  </ul>
</div>`, "results.html"),
        code("css", `
.listing {
  display: grid;
  grid-template-columns: 260px 1fr;   /* filters | results */
  gap: 24px;
  padding: 0 16px;
}
.product-list {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.product-card { flex: 1 1 220px; }

@media (max-width: 700px) {
  .listing { grid-template-columns: 1fr; }
  .filters { order: 2; }               /* filters below the results on phones */
}`, "listing.css"),
        p("Every declaration is valid, and the page looked fine with the test data, where every product had a short name with spaces. Real data and real users found three problems: on a 320px-wide phone the page scrolls sideways, on desktop a search with 12 results ends with a row of two huge cards, and a keyboard user on a phone presses Tab once and the page jumps to the bottom. Before reading on, predict what causes the first one, and test a few facts about the CSS involved."),
        challenge("chal_quiz_webf_221"),

        h2("2. Reproduce it"),
        p("You can reproduce all three bugs in any Chromium browser in a few minutes. Firefox and Safari have similar tools under different names."),
        numbered([
            "Open the results page, open DevTools (F12) and turn on the device toolbar (Ctrl+Shift+M, or Cmd+Shift+M on macOS). Choose **Responsive** and set the width to **320**. WCAG 1.4.10 Reflow uses 320 CSS px because that is what a 1280px-wide window shows at 400% zoom.",
            "Search for \"power bank\". Scroll right: the whole page moves, and the cards stick out past the right edge. A page that needs scrolling in two directions to read text fails 1.4.10.",
            "In the Elements panel, click the `grid` badge next to `.listing`. The grid overlay draws the tracks; in the Layout pane, turn on **Show track sizes**. The single column is labelled `1fr`, but it measures 412px in a 288px container.",
            "Find the element that is too wide: paste the snippet below into the Console. It lists every element whose right edge is past the viewport, and the product card with the long name is among them.",
            "Now set the width to a desktop size where the results column is 1200px wide. Click the `flex` badge next to `.product-list`: the overlay shows three flex lines with 5, 5 and 2 items, and the last two items are 588px wide each.",
            "Back at 320px, click the page's address bar and press Tab. Focus lands on the first filter checkbox, which is now drawn below all twelve products, so the page scrolls to the bottom. The next 13 Tab presses stay down there.",
        ]),
        code("javascript", `
const vw = document.documentElement.clientWidth;
[...document.querySelectorAll("body *")]
  .filter((el) => el.getBoundingClientRect().right > vw + 1)
  .map((el) => el.tagName.toLowerCase() + "." + el.className);`, "DevTools console"),
        callout("info", "Automated checkers rarely catch this",
            "Reflow and focus order depend on real content, on the viewport and on what a person expects to happen. Lighthouse and axe report many problems, but checking 320px width and the Tab order is a manual step: do it whenever you change a layout."),

        h2("3. One dimension or two: Flexbox or Grid?"),
        p("Both layout systems place children of a container, both support `gap`, and both can wrap. The difference is the direction of control."),
        bullets([
            "**Flexbox is one-dimensional and content-out.** It lays items out along one axis (a row or a column). Each item's size starts from its content or its `flex-basis`, and the leftover space on that line is shared out. Items on different lines know nothing about each other, so they do not line up in columns.",
            "**Grid is two-dimensional and layout-in.** You define rows and columns on the container first, and items are placed into that structure. Every item in a column has the same width, whatever its content.",
        ]),
        p("A practical rule: if the items should decide their own size (a row of buttons, tags, a toolbar, a navigation bar, a card's header with a title and a price), use Flexbox. If the container should decide the sizes and things must line up in both directions (a page layout, a card grid, a form with labels and fields), use Grid. The two combine well: a grid of cards, where each card uses Flexbox inside."),

        h2("4. Flexbox: the flex shorthand and the stretched last row"),
        p("A flex item's size on the main axis comes from three properties, usually set together with the `flex` shorthand:"),
        bullets([
            "`flex-grow`: how much of the **positive** free space on the line the item takes, relative to the others (0 = none).",
            "`flex-shrink`: how much the item gives up when the items are too big for the line (0 = never shrink).",
            "`flex-basis`: the starting size before growing or shrinking (`auto` = use `width`, or the content size).",
        ]),
        code("css", `
.item { flex: initial; }  /* 0 1 auto - the default: no growing, may shrink */
.item { flex: auto; }     /* 1 1 auto - start from the content size, then grow */
.item { flex: 1; }        /* 1 1 0%   - start from zero: equal shares of the line */
.item { flex: none; }     /* 0 0 auto - exactly the content size */
.item { flex: 1 1 220px; } /* start at 220px, then grow or shrink */`, "flex.css"),
        p("`flex: 1` is the one people guess wrong. Because the basis is 0%, the whole line is free space, so three `flex: 1` items get exactly equal widths even if one has much more text. With `flex: auto`, the longer item ends up wider."),
        h3("Why the last row stretched"),
        p("With `flex-wrap: wrap`, the browser fills a line with as many items as fit at their basis (plus the gaps), then starts a new line. Each line then shares out its own leftover space. At 1200px with `flex: 1 1 220px` and a 24px gap, five items fit (5 x 220 + 4 x 24 = 1196px), so 12 cards make lines of 5, 5 and 2. On the last line, two cards share 1176px and each grows to 588px. Flexbox is doing exactly what it was asked: there are no columns for the last line to line up with."),
        callout("tip", "If items must line up, you want Grid",
            "Tricks like invisible spacer items or a max-width on each card only hide the problem. A card list that should form columns is a two-dimensional layout: use Grid, as in the next section."),

        h2("5. Grid: tracks, fr, minmax() and repeat()"),
        p("`grid-template-columns` lists the column tracks. A track can be a length (`200px`), a percentage of the grid container's width (`25%`), or a flexible `fr` value:"),
        code("css", `
.layout   { grid-template-columns: 260px 1fr; }       /* sidebar + the rest */
.thirds   { grid-template-columns: 1fr 2fr 1fr; }     /* 1 : 2 : 1 */
.form-row { grid-template-columns: minmax(8rem, 12rem) 1fr; }`, "grid.css"),
        bullets([
            "**fr shares the free space**: the container width minus the fixed tracks and minus the gaps. In `200px 1fr 2fr` with a 16px gap in a 1000px container, the free space is 1000 - 200 - 32 = 768px, so the tracks are 200px, 256px and 512px.",
            "`minmax(min, max)` gives a track a size range: never smaller than `min`, never larger than `max`.",
            "`repeat(3, 1fr)` is short for `1fr 1fr 1fr`.",
        ]),
        h3("A responsive card grid without media queries"),
        code("css", `
.product-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 24px;
}`, "cards.css"),
        p("`auto-fill` asks the browser to create as many columns as fit, using the `minmax()` minimum: each column is at least 220px, and the number of columns is the largest count whose minimums plus the gaps between them fit in the container. The `1fr` maximum then stretches those columns to fill the row exactly. At 1200px that is five columns of 220.8px; at 700px, two columns of 338px; on a phone, one column. Twelve products make rows of 5, 5 and 2, and the last two cards line up under the others."),
        bullets([
            "`auto-fill` keeps every column it created, even when it is empty. A search with two results shows two normal-sized cards and empty space.",
            "`auto-fit` creates the same columns, then **collapses the empty ones** to zero. A search with two results shows two cards that share the whole row - the giant-card look again. Use `auto-fit` when you want few items to fill the row (a row of feature boxes), and `auto-fill` for a list of cards that should keep a steady size.",
        ]),

        h2("6. The automatic minimum: why 1fr overflowed"),
        p("Here is the rule behind the phone bug. `1fr` on its own is short for `minmax(auto, 1fr)`. The `auto` minimum means: this track may not become narrower than the minimum size of the items in it. And grid and flex items have `min-width: auto` by default, which resolves to a content-based minimum - roughly their **min-content width**, the width of the longest piece of content that cannot wrap."),
        p("Normal text can wrap at spaces and hyphens, so its min-content width is just its longest word. `PWRBANK20000MAHUSBCPD65WBLACKEDITION` has no wrap opportunity at all, so the card's min-content width is the full 412px of that name. The `1fr` column grows to 412px, the 288px container overflows, and the page scrolls sideways. A long URL, an email address, or a code block with `white-space: pre` causes the same overflow."),
        image("fr-track-auto-minimum", {
            alt: "Diagram in three parts. Top left, before: a grid with grid-template-columns: 1fr in a 288px phone container; a card holding the unbroken product name PWRBANK20000MAHUSBCPD65WBLACKEDITION is 412px wide and sticks out of the container, so the page scrolls sideways and fails 1.4.10 Reflow. Top right, after: with minmax(0, 1fr) and overflow-wrap, the column is 288px, the same as the container, and the name wraps onto two lines. Bottom: a bar showing grid-template-columns: 200px 1fr 2fr with a 16px gap in a 1000px container; the free space of 1000 minus 200 minus two 16px gaps is 768px, shared 1 to 2 into 256px and 512px.",
            caption: "A 1fr track has an automatic minimum: its widest unbreakable content. minmax(0, 1fr) removes it; fr tracks share only the space left after fixed tracks and gaps.",
        }),
        p("The fix has two parts. First, let the boxes shrink. Second, decide what the content does in the narrower box:"),
        code("css", `
/* 1. Let the box shrink below its content */
.listing     { grid-template-columns: 260px minmax(0, 1fr); }  /* Grid track */
.flex-child  { min-width: 0; }                                  /* Flexbox item */

/* 2. Decide what the content does */
.product-card h2 { overflow-wrap: anywhere; }   /* long names may break anywhere */
pre              { overflow-x: auto; }          /* code scrolls inside its own box */`, "overflow-fix.css"),
        bullets([
            "`minmax(0, 1fr)` and `min-width: 0` only stop the **box** from growing. The long text still overflows that box, and overflowing content still widens the page, so you need step 2 as well.",
            "`overflow-wrap: anywhere` allows breaks inside a long word and also lowers the min-content width. `overflow-wrap: break-word` breaks the line too, but does **not** lower the min-content width, so it does not stop an `auto` track from growing.",
            "A scroll container (`overflow` other than `visible`) has no content-based minimum, which is why `pre { overflow-x: auto }` can shrink.",
        ]),
        p("Track sizing is plain arithmetic once you know the rules, and DevTools shows you the results. In the challenge you write that arithmetic yourself for a small part of the grammar: px, % and fr tracks, gaps, and the two auto-repeat keywords. Like `minmax(0, 1fr)`, it assumes content always fits, so there is no automatic minimum to compute."),
        challenge("chal_coding_webf_222", "Handle the two template forms separately. For the repeat() form, match it with a regular expression, compute the column count from the formula in the contract (gaps included), and only then decide how many tracks the items really use. For a track list, resolve every px and % track first, subtract them and the gaps from the width, clamp at 0, and share the rest by fr weight. Round only the final widths."),

        h2("7. Logical properties: start and end, not left and right"),
        p("The shop also has an Arabic storefront, which sets `dir=\"rtl\"` on the `html` element. Flexbox rows and grid columns already follow the writing direction: in a right-to-left page the first flex item and grid column 1 are on the right. But physical properties such as `margin-left` do not flip, so the old card CSS put the price's spacing on the wrong side."),
        p("Logical properties describe sides by their role in the text flow instead of by screen direction. The **inline** axis is the direction text runs in a line; the **block** axis is the direction lines and paragraphs stack:"),
        code("css", `
.product-card {
  padding-block: 12px;           /* top and bottom in horizontal text */
  padding-inline: 16px;          /* left and right in horizontal text */
  inline-size: 100%;             /* width in horizontal text */
  border-inline-start: 4px solid var(--accent);   /* left in ltr, right in rtl */
}
.product-card .price {
  margin-inline-start: auto;     /* push to the end of the line, in any direction */
  text-align: end;
}`, "logical.css"),
        bullets([
            "In a left-to-right page, `margin-inline-start` is `margin-left`; with `dir=\"rtl\"` it is `margin-right`. In a vertical writing mode (`writing-mode: vertical-rl`, used for some Japanese and Chinese text) the inline axis runs top to bottom, and `inline-size` is the height.",
            "`margin-inline: auto` centres a block horizontally in horizontal text, the logical form of `margin: 0 auto`.",
            "Use logical properties by default for spacing, borders, sizes and `text-align` (`start` / `end`). Keep physical ones only for things that really are physical, such as a shadow that falls towards the bottom-right.",
        ]),

        h2("8. Visual order is not reading order"),
        p("The phone media query moved the filters below the results with `order: 2`. That changed where the filters are **painted**, and nothing else. The DOM order still has the filters first, and the DOM order is what keyboard users and screen readers get:"),
        bullets([
            "**Tab order follows the DOM** (plus `tabindex`). `order`, `grid-row`, `grid-column`, `grid-template-areas`, `flex-direction: row-reverse` and `column-reverse` do not change it.",
            "**Screen readers read the DOM order.** A screen reader user hears the 14 filter checkboxes before the results, while the screen shows results first.",
            "**WCAG 2.2 cares about both.** 1.3.2 Meaningful Sequence (level A) requires that when the order of content affects its meaning, a correct reading sequence can be determined from the code. 2.4.3 Focus Order (level A) requires that focus moves in an order that preserves meaning and operability. Focus jumping to the bottom of the page and back again fails it.",
        ]),
        callout("warning", "Fix the source order, not the paint order",
            "If the visual order on a screen size must be different, change the HTML order (or the design) so that both agree. Reordering with CSS is safe only for content where order does not matter, such as purely decorative items, or when the visual change matches the DOM order (for example a sidebar that moves from the left to the top)."),

        h2("9. The fix"),
        p("The team kept the filters first in the DOM - they are first on desktop too - and put them inside a `details` element that starts closed, so on a phone they take one line and one Tab stop at the top of the page. The product list became a grid, the tracks may shrink, and the long names may wrap:"),
        code("html", `
<div class="listing">
  <details class="filters">
    <summary>Filters</summary>
    <!-- the same 14 checkboxes -->
  </details>
  <ul class="product-list">
    <li class="product-card">...</li>
  </ul>
</div>`, "results.html"),
        code("css", `
.listing {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 24px;
  padding-inline: 16px;
}
.product-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 24px;
}
.product-card {
  display: flex;
  flex-direction: column;
  padding-block: 12px;
  padding-inline: 16px;
}
.product-card h2 { overflow-wrap: anywhere; }

@media (max-width: 700px) {
  .listing { grid-template-columns: minmax(0, 1fr); }   /* no order: the DOM order is the visual order */
}`, "listing.css"),
        bullets([
            "`minmax(0, 1fr)` lets the results column be as narrow as its container; `overflow-wrap: anywhere` wraps the long product name instead of widening the card.",
            "`repeat(auto-fill, ...)` makes real columns, so the last row of 2 cards lines up under the 5 above it at 220.8px each.",
            "`min(220px, 100%)` stops a single column from overflowing a container narrower than 220px (a phone at high zoom). Without it, `minmax(220px, 1fr)` keeps the column at 220px even in a 200px container.",
            "`details` and `summary` are a native disclosure widget: the summary is keyboard operable and announced as expanded or collapsed, with no script. The filters stay before the results in both the DOM and the visual order.",
        ]),
        p("Check the result the way you reproduced the bug: 320px width with no horizontal scrollbar, the grid overlay with columns that fit the container, and a Tab order that moves down the page without jumps."),

        h2("10. Pitfalls to recognise in code review"),
        bullets([
            "`grid-template-columns: 1fr` or `repeat(3, 1fr)` on content you do not control (names, URLs, code, tables). Ask whether the track should be `minmax(0, 1fr)`.",
            "A flex item that contains long text or a `pre` and has no `min-width: 0`: it cannot shrink below its content.",
            "`min-width: 0` or `minmax(0, 1fr)` without a plan for the content: the text now overflows the card instead of the column.",
            "`flex: 1` when items should size to their content (it means a basis of 0%), or `flex-wrap` card lists that are expected to line up in columns.",
            "`auto-fit` on a list of cards that can have few results: the cards grow to fill the row.",
            "`order`, `row-reverse`, `column-reverse` or grid placement that makes the visual order different from the DOM order of interactive or meaningful content.",
            "`margin-left`, `padding-right`, `left: 0` or `text-align: left` in components that may be shown in a right-to-left language.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Flexbox for one-dimensional, content-sized rows or columns; Grid when items must line up in rows and columns.",
            "Card lists use `repeat(auto-fill, minmax(min(<size>, 100%), 1fr))` and `gap`, not `flex-wrap` with growing items.",
            "Tracks that hold unpredictable content are `minmax(0, 1fr)`; flex items with such content have `min-width: 0`.",
            "Long words and URLs can wrap (`overflow-wrap: anywhere`); code blocks and wide tables scroll inside their own box (`overflow-x: auto`).",
            "The page has no horizontal scrolling at 320 CSS px (1.4.10 Reflow), checked in device mode with the grid and flex overlays.",
            "Spacing, borders and alignment use logical properties (`margin-inline`, `padding-block`, `inline-size`, `text-align: start`).",
            "The visual order matches the DOM order; Tab moves through the page in the order it is seen (1.3.2, 2.4.3).",
        ]),
    ],
});
