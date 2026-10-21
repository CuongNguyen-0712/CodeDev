// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-1-1",
    title: "Semantic HTML: landmarks, headings & the document outline",
    slug: { _type: "slug", current: "semantic-html-landmarks-headings" },
    description:
        "A shop rebuilds its article pages with a component library of styled divs. The page looks identical, but a blind customer's screen reader now lists \"Deals\" five times as the only headings, finds no landmarks, and needs 60 Tab presses to reach the article. Learn how landmarks and headings give a page its structure, why the old outline idea never worked, how a skip link bypasses repeated blocks, and write a checker that audits a page tree.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, Trailhead (outdoor gear shop with a buying-guide magazine)",
        problem:
            "Two weeks after the article pages moved to the new component library, a customer who is blind and uses the NVDA screen reader writes to support about the guide \"How we test trail running shoes\". The headings list shows \"Deals\" five times, all level 1, and nothing else. The landmarks list is empty. To reach the article she presses Tab 60 times: the logo, 54 menu links and 5 deal cards. Sighted visitors see no change at all, the old template had a header, a nav, a main and an h1 title, and the shop's accessibility statement promises WCAG 2.2 AA. Support has three more tickets like it.",
    },

    content: [
        h2("1. The incident: a page that only looks structured"),
        p("The rebuild replaced hand-written templates with reusable components. Every component renders a `div` with a class, the CSS reproduces the old design pixel for pixel, and the visual review passed. This is the HTML the guide page now ships:"),
        code("html", `
<body>
  <div class="c-top">
    <a class="c-logo" href="/">Trailhead</a>
    <div class="c-menu">
      <a href="/men">Men</a>
      <a href="/women">Women</a>
      <!-- ... 52 more links in the mega menu -->
    </div>
  </div>

  <div class="c-page">
    <div class="c-rail">
      <!-- DealCard: "each card is its own section, so h1 is fine here" -->
      <section class="c-card">
        <h1 class="c-card__eyebrow">Deals</h1>
        <a href="/p/101">Ridge 4 GTX</a>
      </section>
      <!-- ... 4 more DealCards -->
    </div>

    <div class="c-title c-title--xl">How we test trail running shoes</div>
    <div class="c-body">
      <div class="c-subtitle">Our test method</div>
      <p>We ran 400 km in twelve pairs ...</p>
    </div>
  </div>

  <div class="c-bottom">(c) 2026 Trailhead</div>
</body>`, "guide.html (rendered)"),
        p("Nothing here is invalid HTML, and nothing looks wrong. But a screen reader does not read your CSS. It reads the **accessibility tree**: the browser's description of the page as roles (heading, link, navigation ...), names and states. A `div` has no role, so the big bold title and the subtitles are just text. The only elements with a structural role are the five `h1` labels inside the deal cards, which the component author chose because of a rule that browsers never implemented. You will see which rule in section 4."),

        h2("2. Reproduce it"),
        p("You can see what the customer heard without a screen reader, but it is worth trying one too. Use any page built like the one above, for example a local copy of it:"),
        numbered([
            "**Keyboard only.** Click the address bar, then press Tab repeatedly and count the stops before the article. On the incident page: 60 (the logo, 54 menu links and 5 deal cards). There is no \"Skip to main content\" link to shorten the trip.",
            "**DevTools accessibility tree.** In Chrome or Edge, open DevTools, select an element in the Elements panel and open the **Accessibility** pane: it shows the computed role and name. Turn on the full-page accessibility tree to see the whole page as assistive technology does. The title `div` shows up as plain text (or a generic node), not as a heading. Firefox has the same view in its Accessibility Inspector.",
            "**axe or Lighthouse.** Run the axe DevTools extension (the Lighthouse accessibility audit runs a subset of the same axe-core rules). With its best-practice rules on, axe reports that the page has no main landmark and that its content is not inside any landmark. It reports nothing about five headings that all say \"Deals\": a tool can check structure, not meaning, so treat a clean result as a minimum, not as proof.",
            "**A screen reader's lists.** With NVDA on Windows, in browse mode press H to jump from heading to heading, D to jump from landmark to landmark, and NVDA+F7 to open the Elements List with its Headings and Landmarks views. With VoiceOver on macOS, press VO+U (Control+Option+U) to open the rotor and switch between its headings and landmarks lists.",
        ]),
        p("On the incident page, H lands on \"Deals\" five times and then says there are no more headings. D finds nothing. That is the whole bug report: the page's structure exists only visually."),
        callout("info", "Why this matters to real users",
            "Many screen reader users explore a new page by its headings first, the way a sighted reader scans the bold lines. Landmarks let them jump straight to the navigation, the main content or the footer. Without either, the only way through a page is from top to bottom, one element at a time."),

        h2("3. Landmarks: the regions of a page"),
        p("A **landmark** is a large region of a page with a role that assistive technology can list and jump to. You almost never write landmark roles by hand: a few HTML elements create them for you."),
        bullets([
            "`header` -> **banner** (the site header), but only when it is not inside `article`, `aside`, `main`, `nav` or `section`. Inside those, it is just the introduction of that part, not a landmark.",
            "`footer` -> **contentinfo** (the site footer), with the same rule as `header`.",
            "`nav` -> **navigation**: a major block of navigation links.",
            "`main` -> **main**: the primary content of the page. Use exactly one visible `main` per page, and do not put it inside `article`, `aside`, `section`, `header`, `footer` or `nav`.",
            "`aside` -> **complementary**: content related to the main content but meaningful on its own, such as a related-products rail.",
            "`section` -> **region**, but only when it has an accessible name (`aria-labelledby` or `aria-label`). A `section` without a name is not a landmark.",
            "`form` -> **form**, also only when it has an accessible name.",
            "`search` -> **search**: a newer element for a search form or filter area.",
        ]),
        p("`article` is not in the list: it marks a self-contained piece of content (a post, a product card, a comment), but it is not a landmark. Classes are not in the list either: `class=\"c-top\"` means nothing to the accessibility tree."),
        image("div-soup-vs-landmarks", {
            alt: "Diagram comparing the accessibility tree of one page built two ways. Built from div components: no landmarks, and the only headings are five h1 Deals, so a keyboard user tabs through about 60 links. Built from native elements: banner, navigation Primary, main, region, complementary and contentinfo landmarks, and an h1 title with h2 sections. Three rules below: header and footer are landmarks only outside article, aside, main, nav and section; section and form need a name; heading level comes from the tag only.",
            caption: "The CSS can be identical. Only the elements decide what a screen reader can list and jump to.",
        }),
        h3("Naming landmarks"),
        p("When a page has two landmarks of the same kind, give each a short name so users can tell them apart. Prefer `aria-labelledby` pointing at a visible heading, so the name and the text on screen cannot drift apart; use `aria-label` when there is no visible text. If both are present, `aria-labelledby` wins."),
        code("html", `
<nav aria-label="Primary">...</nav>
<nav aria-label="Breadcrumb">...</nav>

<section aria-labelledby="reviews-title">
  <h2 id="reviews-title">Customer reviews</h2>
  ...
</section>`, "names.html"),
        p("Do not repeat the role in the name: a screen reader already announces something like \"Primary, navigation landmark\", so `aria-label=\"Primary navigation\"` is heard as \"navigation\" twice."),
        callout("tip", "Native elements before ARIA roles",
            "The first rule of ARIA: if a native HTML element already has the meaning and behaviour you need, use it instead of adding a role to a div. div role=\"navigation\" does create a landmark, but nav does the same with no attribute to forget, and it keeps working when a component is copied without its ARIA."),

        h2("4. Headings: the page's table of contents"),
        p("Headings are how most screen reader users find their way through content. A list of the page's headings should read like a table of contents: one `h1` naming the page, `h2` for its main sections, `h3` for subsections of an `h2`, and so on."),
        p("The level of a heading comes **only from its tag**: `h1` is level 1, `h4` is level 4. That is the rule the DealCard author did not know. Older versions of the HTML specification described a \"document outline algorithm\" in which an `h1` nested inside `section` elements would be treated as a lower level. No browser ever implemented it for the accessibility tree, and it was removed from the HTML standard in 2022. Five cards with an `h1` each produce five level-1 headings, however deeply they are nested."),
        code("html", `
<!-- Wrong: relies on nesting to lower the level -->
<section>
  <h1>Our test method</h1>            <!-- announced as heading level 1 -->
  <section>
    <h1>Lab tests</h1>                <!-- still level 1 -->
  </section>
</section>

<!-- Right: the tag says the level, CSS sets the size -->
<section aria-labelledby="method">
  <h2 id="method">Our test method</h2>
  <h3 class="title-sm">Lab tests</h3>
</section>`, "levels.html"),
        bullets([
            "**Pick the level from the structure, the size from CSS.** If the design wants a small heading, keep the right tag and add a class. Never choose `h4` because it happens to have the right font size.",
            "**Do not skip levels on the way down.** Going from an `h2` straight to an `h4` makes users wonder what they missed. Going back up (`h4` then `h2`) is normal: it closes a subsection. A skipped level is not by itself a WCAG failure, but checkers such as axe report it as a best-practice issue, and it usually means the levels were chosen for looks.",
            "**No empty headings.** An `h2` that only contains an icon, or that is filled in later by script, is announced as \"heading level 2\" with nothing after it.",
            "**Real headings, not bold text.** Text that looks like a heading must be a heading element. A `div` styled to look like one hides the structure.",
        ]),
        p("Two WCAG 2.2 success criteria cover this. **1.3.1 Info and Relationships** (level A) requires that structure shown visually, such as headings, lists and regions, is also available in the markup. **2.4.6 Headings and Labels** (level AA) requires that headings and labels describe their topic or purpose: five headings that all say \"Deals\" fail that even if they were the right level. WCAG does not require exactly one `h1`; one `h1` that names the page is a strong convention that users rely on."),
        p("Check your understanding of the landmark and heading rules before you fix the page:"),
        challenge("chal_quiz_webf_111"),

        h2("5. A skip link for keyboard users"),
        p("Landmarks help screen reader users, but a sighted person who uses only the keyboard has no landmark shortcut in the browser. **2.4.1 Bypass Blocks** (level A) requires a way to skip blocks of content that repeat on every page, such as the header and its 54 menu links. Landmarks and headings count as such a mechanism in WCAG's techniques, and a **skip link** is the one that works for everybody: the first focusable element on the page, linking to the main content."),
        code("html", `
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>...</header>
  <main id="main">...</main>
</body>`, "skip-link.html"),
        code("css", `
.skip-link {
  position: absolute;
  inset-inline-start: 1rem;
  inset-block-start: 1rem;
  transform: translateY(-200%);   /* off screen until it gets focus */
}
.skip-link:focus {
  transform: none;                /* visible as soon as a Tab reaches it */
}`, "skip-link.css"),
        p("The link stays in the tab order and appears when focused. Do not hide it with `display: none` or the `hidden` attribute: that removes it from the tab order and from the accessibility tree, so nobody can use it."),

        h2("6. The fix: same components, real elements"),
        p("The fix does not change the design. The components keep their classes and their CSS; they render the element that matches their meaning. The deal rail moves after the article in the source, and the CSS grid still places it in the sidebar column, so the reading order and the Tab order follow the content."),
        code("html", `
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header class="c-top">
    <a class="c-logo" href="/">Trailhead</a>
    <nav class="c-menu" aria-label="Primary">
      <ul>
        <li><a href="/men">Men</a></li>
        <li><a href="/women">Women</a></li>
        <!-- ... -->
      </ul>
    </nav>
  </header>

  <main id="main" class="c-page">
    <article>
      <header>
        <h1 class="c-title c-title--xl">How we test trail running shoes</h1>
      </header>
      <section aria-labelledby="method">
        <h2 id="method" class="c-subtitle">Our test method</h2>
        <h3>Lab tests</h3>
        <p>...</p>
        <h3>Trail tests</h3>
        <p>We ran 400 km in twelve pairs ...</p>
      </section>
      <footer><p>Written by Mai Tran</p></footer>
    </article>

    <aside class="c-rail" aria-labelledby="deals-title">
      <h2 id="deals-title" class="visually-hidden">Today's deals</h2>
      <ul>
        <li class="c-card">
          <p class="c-card__eyebrow">Deal</p>
          <h3><a href="/p/101">Ridge 4 GTX</a></h3>
        </li>
        <!-- ... 4 more cards -->
      </ul>
    </aside>
  </main>

  <footer class="c-bottom">(c) 2026 Trailhead</footer>
</body>`, "guide.html (fixed)"),
        p("Walk through what the screen reader now finds. Landmarks: banner (the page header), navigation \"Primary\", main, region \"Our test method\", complementary \"Today's deals\" and contentinfo (the page footer). The article's own `header` and `footer` are not landmarks, because they are inside `article`. Headings: the title as the only `h1`, two `h2` sections, and one `h3` per subsection and per product, which now names the product instead of repeating \"Deals\". One Tab reaches the skip link, Enter jumps to the article."),
        p("The rail needs a heading for its place in the outline, but the design shows none. The `visually-hidden` class keeps the heading in the accessibility tree while removing it from the screen:"),
        code("css", `
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}`, "utilities.css"),

        h2("7. Build a structure checker"),
        p("Reviewing every page by hand does not scale with a component library. The team wants a small checker that runs on the rendered HTML of each page in CI and prints the heading outline, the landmarks and the problems. The challenge runs without a browser, so the page arrives already parsed, as a tree of plain objects:"),
        code("javascript", `
{
  tag: "section",
  attrs: { "aria-labelledby": "method" },
  children: [
    { tag: "h2", attrs: { id: "method" }, text: "Our test method" },
    { tag: "h3", text: "Lab tests" },
  ],
}`),
        p("Your function walks that tree and applies the rules from this lesson: heading levels from the tag only, `header` and `footer` as landmarks only at the top level, `section` and `form` only with a name, `aria-labelledby` before `aria-label`. It reports skipped levels, empty headings, a missing `h1` and a missing or repeated `main`. The starter file describes the exact output format, and gives you a `textOf` helper for the text inside an element."),
        challenge("chal_coding_webf_112", "Write one recursive walk and pass down the list of ancestor tags: header and footer only need to know whether one of those is article, aside, main, nav or section. Before the walk, build a map from id to element so aria-labelledby can be resolved, and work out an element's name before you decide whether a section or form is a landmark. For skipped levels, compare each heading only with the heading just before it."),

        h2("8. Pitfalls to recognise in code review"),
        bullets([
            "**A layout and a page that both render `main`.** In component frameworks the app shell often wraps every page in `main`, and a page component adds its own. The result is two main landmarks; keep `main` in one place.",
            "**Several `nav` elements without names**, or names that repeat the role (\"Main navigation menu\"). Users hear a list of identical \"navigation\" landmarks.",
            "**An `aria-label` on every `section`.** Each named section becomes a landmark. Name the few regions users would want to jump to; a page with twenty regions is as hard to use as one with none.",
            "**`aria-label` on a plain `div`.** Without a role, it does not create a landmark, and screen readers may ignore it. Use the native element.",
            "**A heading level picked to match a font size**, and a design system that has heading components called by size (\"H4 component\") instead of by level.",
            "**Headings or skip links hidden with `display: none`.** That hides them from everyone, including screen readers; use a visually-hidden class for content that is for assistive technology only.",
            "**Reordering with CSS instead of in the HTML.** `order` or grid placement can make the visual order differ from the source order, and keyboard and screen reader users follow the source.",
        ]),

        h2("9. Checklist"),
        bullets([
            "The page header is a top-level `header`, the site navigation is a `nav`, the primary content is in exactly one visible `main`, and the site footer is a top-level `footer`.",
            "Two landmarks of the same kind have short, different names that do not repeat the role; `aria-labelledby` points at visible text where there is some.",
            "`section` and `form` have a name only when they should appear as landmarks.",
            "Native elements are used before ARIA roles; no landmark depends on a `div` with a `role`.",
            "One `h1` names the page; heading levels follow the structure, never the font size, and do not skip levels on the way down.",
            "No empty headings; every heading describes the content that follows it (2.4.6).",
            "Text that looks like a heading, list or region is marked up as one (1.3.1).",
            "A skip link is the first focusable element, becomes visible on focus, and links to `main` (2.4.1).",
            "You have checked the page with the keyboard and with the headings and landmarks lists of a screen reader or the DevTools accessibility tree, not only with an automated score.",
        ]),
    ],
});
