// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-3-2",
    title: "Keyboard access & focus order",
    slug: { _type: "slug", current: "keyboard-access-focus-order" },
    description:
        "After a checkout redesign, a keyboard-only customer needs 23 Tab presses to reach \"Pay\", cannot apply a coupon at all, and cannot see where focus is. Learn who relies on the keyboard, why native buttons and links beat clickable divs, how tabindex and the DOM decide the Tab sequence, how to keep focus visible and unobscured, and how dialogs, inert and skip links manage focus.",
    estimatedTime: 22,

    scenario: {
        role: "Front-end developer, checkout team of a home-goods web shop",
        problem:
            "The redesigned checkout shipped on a Tuesday. Nine days later support has 14 tickets from customers who do not use a mouse. One of them, who navigates with the keyboard because of a hand tremor, wrote: \"Tab jumps from the email field to the footer, then back to the top, and I cannot see where I am. It took me 23 presses to reach Pay, and the coupon button never got focus at all.\" Analytics agree: 38 sessions typed a coupon code and paid full price without ever applying it.",
    },

    content: [
        h2("1. The incident: a checkout that only works with a mouse"),
        p("The redesign looked good in every screenshot and passed manual testing - with a mouse. This is the part of the page the tickets are about, trimmed to the lines that matter:"),
        code("html", `
<header class="site-header">            <!-- position: sticky; height: 72px -->
  <a href="/"><img src="/logo.svg" alt="Homely"></a>
  <nav> ... 5 links ... </nav>
  <input type="search" aria-label="Search"> <button>Search</button>
  <a href="/cart">Cart</a>
</header>

<main>
  <form class="checkout">
    <label for="email">Email</label>
    <input id="email" type="email" tabindex="1">     <!-- "so it gets focus first" -->
    <!-- name, address, city, postcode, country, phone, shipping ... -->
    <label for="coupon">Coupon code</label>
    <input id="coupon">
    <div class="btn" onclick="applyCoupon()">Apply coupon</div>
    <label><input type="checkbox" required> I accept the terms</label>
    <button type="submit">Pay</button>
  </form>
</main>

<footer>
  <label><input type="checkbox" tabindex="2"> Send me the newsletter</label>
  <a href="/privacy">Privacy</a> ...
</footer>`, "checkout.html"),
        code("css", `
*:focus { outline: none; }          /* "the blue ring looks ugly on our buttons" */

.site-header { position: sticky; top: 0; height: 72px; }`, "base.css"),
        p("Four small decisions, each made for a reason that sounded fine, add up to a page that a keyboard user can barely operate:"),
        bullets([
            "`tabindex=\"1\"` and `tabindex=\"2\"` pull the email field and the newsletter checkbox **ahead of every other element on the page**. Tab 1 is the email, Tab 2 is the footer, Tab 3 is the logo at the top. Pay is press number 23.",
            "The \"Apply coupon\" control is a `div` with a click handler. It never receives focus, so it cannot be reached with Tab at all.",
            "`*:focus { outline: none }` removes the only visible sign of where focus is.",
            "The sticky header covers the top 72px of the viewport. When customers Shift+Tab back up the form, the browser scrolls each field just to the top edge of the viewport - under the header.",
        ]),

        h2("2. Reproduce it"),
        p("You do not need a screen reader to find these bugs. Put the mouse away and use the page:"),
        numbered([
            "Click the address bar, then press **Tab** repeatedly. Count the presses until Pay. Use **Shift+Tab** to go back, **Enter** to follow links and press buttons, **Space** to press buttons and toggle checkboxes.",
            "Watch where focus is. In Chrome DevTools, open the Console, click the eye icon (\"Create live expression\") and type `document.activeElement`: it shows the focused element on every press, even when the page shows nothing.",
            "In Firefox DevTools, open the **Accessibility** panel and turn on **Show Tabbing Order**: every element in the Tab sequence gets a numbered marker on the page. On the broken checkout, 1 is the email field and 2 is down in the footer.",
            "Run Lighthouse or axe DevTools. Both flag elements with a `tabindex` greater than 0. Neither can tell you that a `div` has a click handler the keyboard cannot reach - only the keyboard test finds that.",
        ]),
        callout("tip", "Testing in Safari on macOS",
            "By default Safari moves Tab only between form fields and skips links. Turn on \"Press Tab to highlight each item on a webpage\" in Safari's Advanced settings before you test, or you will see a different sequence than your users."),

        h2("3. Who uses the keyboard, and what WCAG asks"),
        p("\"Keyboard users\" are a larger group than it sounds. Blind and low-vision people use screen readers, which are driven from the keyboard. People with tremors, limited hand movement or repetitive strain injury use a keyboard, a switch device or voice control, and many of those tools work by sending keystrokes. Power users fill in forms faster without the mouse. And anyone with a broken trackpad is a keyboard user for the day."),
        p("Two WCAG 2.2 criteria at level A set the baseline:"),
        bullets([
            "**2.1.1 Keyboard**: everything you can do with a pointer, you can do with the keyboard alone (without needing specific timings for keystrokes). The coupon `div` fails it.",
            "**2.1.2 No Keyboard Trap**: if focus can move into a component with the keyboard, it can move out again with the keyboard - an embedded video player or a date picker must not swallow Tab forever. If leaving needs more than Tab, Shift+Tab or the arrow keys, the user has to be told how.",
        ]),

        h2("4. Use real buttons and links"),
        p("The cheapest way to pass 2.1.1 is to not rebuild what the browser already has. Compare what you get from each line:"),
        code("html", `
<!-- Mouse only -->
<div class="btn" onclick="applyCoupon()">Apply coupon</div>

<!-- Everyone -->
<button type="button" class="btn" onclick="applyCoupon()">Apply coupon</button>`, "coupon.html"),
        p("A native `<button>` gives you, without a line of JavaScript:"),
        bullets([
            "**Focus**: it is in the Tab sequence.",
            "**Keyboard activation**: Enter and Space fire the same `click` event as the mouse, so the one `onclick` handler serves everyone.",
            "**Role and name**: assistive technology announces \"Apply coupon, button\" (4.1.2 Name, Role, Value).",
            "**`disabled`**: one attribute removes it from the Tab sequence, ignores clicks and is announced as unavailable.",
        ]),
        p("A `div` gets none of these. Adding `tabindex=\"0\"` and `role=\"button\"` fixes focus and the announced role, but you still have to handle Enter and Space in a keydown listener, stop Space from scrolling the page, and build the disabled state yourself - code the browser already ships."),
        h3("Button or link?"),
        bullets([
            "**`<a href>`** navigates: to another page, a section (`#shipping`) or a file. Enter follows it. Without an `href` attribute, an `<a>` is not a link at all: not focusable, no link role.",
            "**`<button>`** acts on the current page: applies a coupon, opens a dialog, submits a form. Enter and Space press it.",
            "Inside a `<form>`, a `<button>` without a `type` is a **submit** button. Give every button that is not meant to submit `type=\"button\"`, or \"Apply coupon\" will submit the whole checkout.",
        ]),

        h2("5. tabindex: three kinds of values"),
        p("`tabindex` controls whether an element can receive focus and whether it is in the Tab sequence. Its value is parsed as an integer, and only the sign really matters:"),
        bullets([
            "**`tabindex=\"0\"`**: focusable and in the Tab sequence, at its place in the document. Use it on custom widgets that are not native controls (a scrollable region, a composite widget) - never as a substitute for `<button>`.",
            "**`tabindex=\"-1\"`**: focusable by script (`element.focus()`) and as a link target, but **not** in the Tab sequence. Use it for things you move focus to on purpose: a dialog heading, an error summary, the `<main>` a skip link points to. It removes only that element - focusable children inside it stay in the sequence.",
            "**Positive values** (`1`, `2`, `10`): focusable and placed **before every other element on the whole page**, in ascending order. This is the anti-pattern behind the incident.",
        ]),
        p("Why positive values are never the answer: the order they create is page-wide and separate from the reading order. Every element you add later without a tabindex lands behind all of them. Components written by different teams compete for the same numbers. And a value that put the email field \"first\" in one layout puts the newsletter checkbox second, wherever it happens to be. If the order is wrong, fix the order of the HTML."),

        h2("6. How the browser builds the Tab sequence"),
        p("The HTML standard calls it the sequential focus navigation order. For a page without positive tabindex, the rule is simple: focusable elements in document order. In full:"),
        numbered([
            "Skip everything that cannot take focus: subtrees that are `hidden` (or `display: none`) or `inert`, disabled form controls, elements with a negative tabindex, and elements that are not focusable at all (`div`, `span`, `<a>` without `href`, `<input type=\"hidden\">`).",
            "First, elements with a positive tabindex, in ascending numeric order; equal values in document order.",
            "Then, elements with `tabindex=\"0\"` and natively focusable elements (links with `href`, buttons, inputs, selects, textareas, ...), in document order.",
        ]),
        image("tab-sequence-from-dom", {
            alt: "Left: checkout elements in document order, with a mini-cart link in an inert aside and an Apply coupon div marked as skipped, and tabindex 1 on Email and 2 on Newsletter. Middle: the skip rules, then positive tabindex in numeric order, then the rest in DOM order. Right: before, the sequence is Email, Newsletter, Logo, Search, Full name, Pay, Privacy; after removing positive tabindex it is Logo, Search, Email, Full name, Pay, Newsletter, Privacy.",
            caption: "The Tab sequence comes from the document, filtered and then sorted. Two positive tabindex values are enough to send focus to the footer and back to the top.",
        }),
        h3("2.4.3 Focus Order: DOM order versus visual order"),
        p("WCAG 2.4.3 Focus Order (level A) asks that focus moves in an order that preserves meaning and operability. Because the sequence follows the DOM, CSS can break it without touching a single tabindex: `order` in Flexbox, explicit placement in Grid, `flex-direction: row-reverse` and absolute positioning all move boxes on screen but leave the Tab sequence where the HTML put it."),
        code("css", `
/* The summary sits first in the HTML but is shown on the right: */
.checkout-layout { display: grid; grid-template-columns: 2fr 1fr; }
.order-summary   { grid-column: 2; grid-row: 1; }
/* Tab now starts in the right-hand column, then jumps back to the left. */`, "layout.css"),
        p("The fix is to write the HTML in the order people read and use the page, then lay it out. Use CSS reordering only for content where the order does not matter for meaning."),

        h2("7. Show where focus is"),
        h3("2.4.7 Focus Visible"),
        p("WCAG 2.4.7 Focus Visible (AA) requires a visible focus indicator. `*:focus { outline: none }` with no replacement fails it on every element of the page. The usual reason for writing it - \"the ring appears when I click a button\" - is exactly what `:focus-visible` solves. It matches when the browser decides focus should be shown: after keyboard navigation, and on text fields even after a click, but usually not after a mouse click on a button."),
        code("css", `
/* Delete: *:focus { outline: none; } */

:focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}`, "base.css"),
        p("Prefer `outline` over `box-shadow` for the indicator: in forced-colors mode (Windows High Contrast) box shadows are removed, while outlines are kept and recoloured. The indicator also needs a 3:1 contrast against the colours next to it (1.4.11 Non-text Contrast)."),
        h3("2.4.11 Focus Not Obscured (Minimum)"),
        p("New in WCAG 2.2 at level AA: when an element receives focus, it must not be **entirely** hidden by author-created content - a sticky header, a cookie banner, a chat widget. (Partly hidden passes the minimum; 2.4.12 Focus Not Obscured (Enhanced), level AAA, asks for no part to be hidden.) The checkout's 72px header hides whole input fields when the browser scrolls them to the top edge. Tell the browser that the top of the viewport is covered:"),
        code("css", `
html {
  scroll-padding-top: calc(72px + 1rem);   /* header height plus breathing room */
}`, "base.css"),
        p("`scroll-padding` shrinks the area the browser considers visible when it scrolls something into view, so focus moves and `#fragment` jumps stop just below the header. Test it with Shift+Tab from the bottom of the form. For sticky footers and banners at the bottom, use `scroll-padding-bottom`."),

        h2("8. Dialogs, inert and skip links"),
        h3("Modal dialogs"),
        p("A modal dialog must keep keyboard focus inside it while it is open, and give it back when it closes. The native `<dialog>` does most of this when you open it with `showModal()`:"),
        code("html", `
<button type="button" id="coupon-help">Where is my code?</button>

<dialog id="coupon-dialog" aria-labelledby="coupon-dialog-title">
  <h2 id="coupon-dialog-title">Finding your coupon code</h2>
  <p>It is in the confirmation email of your last order.</p>
  <form method="dialog"><button>Close</button></form>
</dialog>

<script>
  const dialog = document.getElementById("coupon-dialog");
  document.getElementById("coupon-help")
    .addEventListener("click", () => dialog.showModal());
</script>`, "coupon-dialog.html"),
        bullets([
            "`showModal()` makes everything outside the dialog **inert**: it cannot be focused or clicked, and it is hidden from assistive technology. Tab cannot wander into the page behind.",
            "Focus moves into the dialog when it opens. Put `autofocus` on the element that should receive it if the default is not right.",
            "**Escape** closes a modal dialog, and so does a button inside `<form method=\"dialog\">`. This is why trapping focus in a modal is not a 2.1.2 keyboard trap: there is a keyboard way out.",
            "When the dialog closes, browsers move focus back to the element that was focused before it opened. If that opener no longer exists (it was re-rendered), call `.focus()` on a sensible element yourself.",
            "`dialog.show()` opens a **non-modal** dialog: the page stays interactive and Escape does not close it.",
        ]),
        h3("The inert attribute"),
        p("`inert` is a global HTML attribute that does to any subtree what `showModal()` does to the page: no focus, no clicks, nothing exposed to assistive technology. Use it for content that is in the DOM but must not be reachable right now, such as a closed off-canvas mini-cart that slides in with a transform:"),
        code("html", `
<aside class="mini-cart" inert>  <!-- remove inert when the drawer opens -->
  <a href="/p/lamp-42">Desk lamp</a>
  <button type="button">Go to checkout</button>
</aside>`, "mini-cart.html"),
        p("A drawer that is only moved off-screen, without `inert` or `hidden`, is still in the Tab sequence: focus disappears into it for a few presses and nothing visible changes."),
        h3("Skip links (2.4.1 Bypass Blocks)"),
        p("Every page of the shop starts with a logo, 5 navigation links, a search field and a cart link: 9 Tab presses before the content. 2.4.1 Bypass Blocks (level A) asks for a way to skip such repeated blocks. Landmarks and headings help screen reader users; for sighted keyboard users the standard tool is a skip link, the first focusable element of the page, visible when it has focus:"),
        code("html", `
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"> ... </header>
  <main id="main" tabindex="-1"> ... </main>
</body>`, "layout.html"),
        code("css", `
.skip-link { position: absolute; left: 1rem; top: 0; transform: translateY(-120%); }
.skip-link:focus { transform: none; }`, "base.css"),
        p("`tabindex=\"-1\"` on `<main>` lets the link move focus there without adding `<main>` to the Tab sequence, so the next Tab press continues inside the content."),
        p("Check what you have learned about native controls, focus styles and dialogs:"),
        challenge("chal_quiz_webf_321"),

        h2("9. The fix"),
        p("The corrected checkout keeps the same layout and loses every workaround:"),
        code("html", `
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"> ... </header>

<main id="main" tabindex="-1">
  <form class="checkout">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email">   <!-- no tabindex -->
    <!-- other fields, in the order customers fill them in -->
    <label for="coupon">Coupon code</label>
    <input id="coupon">
    <button type="button" onclick="applyCoupon()">Apply coupon</button>
    <label><input type="checkbox" required> I accept the terms</label>
    <button type="submit">Pay</button>
  </form>
</main>

<footer>
  <label><input type="checkbox"> Send me the newsletter</label>
  ...
</footer>`, "checkout.html"),
        bullets([
            "No positive tabindex: the sequence is the document order, and the email field is the first field of the form because it is the first field in the HTML.",
            "\"Apply coupon\" is a `<button type=\"button\">`: focusable, Enter and Space work, and it does not submit the form.",
            "`:focus-visible` replaces `outline: none`, and `scroll-padding-top` keeps focused fields below the sticky header.",
            "The skip link jumps past the 9 header controls: Tab, Enter, Tab reaches the email field.",
        ]),
        p("The team also keeps a small audit script that lists the Tab sequence from an element tree, to catch regressions in the page templates. It has bugs of its own: it disagrees with the browser on the checkout and on the account page. Fix it."),
        challenge("chal_fix_webf_322", "Compare the script's output with the rules of section 6 one by one: which subtrees must be skipped completely, when does an <a> count as a link, and what type does an attribute value have when you compare two of them?"),

        h2("10. Pitfalls to recognise in code review"),
        bullets([
            "**`onclick` on a `div`, `span`, `li` or `img`.** If it does something, it should be a `<button>`; if it goes somewhere, an `<a href>`.",
            "**Any `tabindex` greater than 0.** Remove it and fix the HTML order instead.",
            "**`outline: none` or `outline: 0`** without a `:focus-visible` style in the same change.",
            "**`<a>` without `href` used as a button** (`<a onclick=\"...\">`), or `href=\"#\"` that scrolls to the top when the script fails.",
            "**A `<button>` in a form without `type`.** It submits the form.",
            "**Off-screen drawers, menus and carousels slides** without `inert` or `hidden`: invisible elements in the Tab sequence.",
            "**CSS `order`, Grid placement or `row-reverse`** on interactive content: the visual order and the Tab order drift apart.",
            "**Custom modals built from `div`s** without focus management. Prefer `<dialog>` with `showModal()`.",
            "**Sticky headers, footers and cookie banners** without `scroll-padding` - check with Shift+Tab that a focused field is never completely covered.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every action works with Tab, Shift+Tab, Enter, Space and Escape alone, and nothing traps focus (2.1.1, 2.1.2).",
            "Actions are `<button>` elements, navigation is `<a href>`, and buttons in forms have an explicit `type`.",
            "No positive `tabindex`; `tabindex=\"0\"` only on custom widgets, `tabindex=\"-1\"` only on elements you focus from script or a link.",
            "The Tab sequence follows the reading order of the page (2.4.3) - checked with the keyboard or Firefox's Show Tabbing Order.",
            "A visible `:focus-visible` style with at least 3:1 contrast; no bare `outline: none` (2.4.7).",
            "Sticky headers and banners never cover a focused element completely; `scroll-padding` is set (2.4.11).",
            "Modals use `<dialog>` with `showModal()`, close with Escape and return focus to the opener; hidden drawers are `inert`.",
            "Pages with repeated navigation start with a skip link to `<main>` (2.4.1).",
        ]),
    ],
});
