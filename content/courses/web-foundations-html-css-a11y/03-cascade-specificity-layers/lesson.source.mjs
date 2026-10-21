// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-2-1",
    title: "The cascade, specificity & layers",
    slug: { _type: "slug", current: "cascade-specificity-layers" },
    description:
        "After a design-system upgrade and a new date-picker stylesheet, the \"Pay now\" button turns grey on the checkout page only, and the !important hotfix breaks its disabled state. Learn how the browser picks one value per property - the cascade sorting order, specificity as an (A, B, C) triple, :is/:where/:not/:has, !important and cascade layers - and resolve the cascade yourself in code.",
    estimatedTime: 25,

    scenario: {
        role: "Junior front-end developer, online furniture shop",
        problem:
            "Tuesday's release upgraded the design system from v3 to v4 and added a delivery-date picker to the checkout. By Wednesday, checkout conversion had dropped from 3.2% to 2.5%: the \"Pay now\" button was light grey, and 46 customers asked support whether payment was broken. Every other page looked fine. A colleague shipped a one-line !important hotfix; on Thursday the button stayed blue even while it was disabled, and 91 support chats said \"Pay now does nothing\".",
    },

    content: [
        h2("1. The incident: a grey button on one page"),
        p("The shop's CSS is split into a few files. As part of the v4 upgrade, the team followed the design system's migration guide and imported it into a cascade layer. The same release added a date-picker library, whose stylesheet is linked only on the checkout page:"),
        code("css", `
/* app.css - loaded on every page */
@layer reset, base, components, utilities;
@import url("/ds/ds-v4.css") layer(components);

/* inside ds-v4.css */
.btn-primary  { background: #1d4ed8; color: #ffffff; }
.btn:disabled { background: #cbd5e1; color: #475569; }`, "app.css"),
        code("html", `
<!-- checkout.html -->
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/vendor/datepicker.min.css">

<form class="checkout">
  <input type="text" class="dp-input" name="delivery" aria-label="Delivery date">
  <button class="btn btn-primary" id="pay" type="submit" disabled>Pay now</button>
</form>`, "checkout.html"),
        code("css", `
/* datepicker.min.css (third-party, not in any layer) - styles its month arrows */
form button { background: #e5e7eb; color: #111827; }`, "datepicker.min.css"),
        p("`.btn-primary` is more specific than `form button`, so the team expected blue. The button was grey. On Wednesday a colleague added one line to the checkout styles, and the button turned blue again:"),
        code("css", `
/* checkout.css - hotfix, linked after datepicker.min.css */
.btn-primary { background: #1d4ed8 !important; }`, "checkout.css"),
        p("The Pay now button is disabled until a delivery date is chosen. After the hotfix it looked exactly the same disabled as enabled, so customers clicked it and nothing happened. Nothing here is random: each step follows a precise rule of the cascade. Predict what the browser does before reading on."),
        challenge("chal_quiz_webf_211"),

        h2("2. Reproduce it in DevTools"),
        p("You can see every decision the cascade made, without reading any source file:"),
        numbered([
            "Open the checkout page, right-click Pay now and choose **Inspect**. The Elements panel selects the button.",
            "In the **Styles** pane, look for `background`. The `form button` rule from `datepicker.min.css` is shown normally. The `.btn-primary` rule is shown under an `@layer components` label, and its `background` is **struck through**: a struck-through declaration lost the cascade.",
            "Hover a selector: Chrome and Edge show its specificity, (0,1,0) for `.btn-primary` and (0,0,2) for `form button`. The less specific rule won, so something decided the contest **before** specificity was compared.",
            "Open the cart page, which does not load the date picker, and inspect its Pay now button: `.btn-primary` wins there. Only one page breaks, because only one page loads the competing rule.",
            "With the hotfix applied, double-click the button in the Elements panel and add the `disabled` attribute (or remove it, to compare both states). The `.btn:disabled` background is struck through; the `!important` declaration beats it.",
            "Switch to the **Computed** tab and expand `background-color`. It shows the final value and links to the rule that set it.",
        ]),
        p("Two questions come out of this: why did an unlayered two-type selector beat a class, and why did `!important` beat a rule that was meant to win only when the button is disabled? Both answers are in the order in which the cascade compares declarations."),

        h2("3. How the browser picks one value"),
        p("For every element and every property, the browser collects all the declarations that apply: from its own default style sheet, from your style sheets, from `style` attributes. If more than one sets the same property, the **cascade** sorts them and keeps the winner. CSS Cascading and Inheritance Level 5 defines the sorting order. The browser asks these questions in turn, and the **first** question that tells two declarations apart decides; later questions are never asked:"),
        numbered([
            "**Origin and importance.** Is it `!important`? Does it come from the browser's defaults, the user, or the page author? Normal author styles beat browser defaults, and an `!important` author declaration beats every normal declaration.",
            "**Context.** Only matters with shadow DOM (styles inside a component vs styles from the page). Not covered in this lesson.",
            "**Element-attached styles.** A declaration in the element's `style` attribute beats any declaration that reaches the element through a selector, with the same importance.",
            "**Cascade layers.** For normal declarations, styles in no layer beat styles in any layer, and a later-declared layer beats an earlier one. For `!important` declarations the order is reversed.",
            "**Specificity.** The more specific selector wins.",
            "**Order of appearance.** The declaration that comes last in the document wins.",
        ]),
        image("cascade-sorting-order", {
            alt: "Diagram of the six cascade steps in order: origin and importance, context, style attribute, cascade layers, specificity, order of appearance. Step 4 is marked as deciding the incident and step 5 the disabled state. On the right, before the fix: form button, unlayered, specificity 0,0,2, beats .btn-primary in layer components, specificity 0,1,0, because unlayered beats every layer. After the fix, with the order reset, vendor, base, components, utilities: .btn-primary in components beats form button in vendor, and .btn:disabled with 0,2,0 wins in the same layer.",
            caption: "Specificity is only step 5. A declaration that loses at step 1, 3 or 4 never gets the chance to use its selector.",
        }),
        p("This explains the grey button. `form button` and `.btn-primary` have the same origin and importance, and neither is in a `style` attribute, so step 4 compares their layers: one is unlayered, one is in `components`, and the unlayered one wins. Before the upgrade, the design system was linked as a plain, unlayered file, both rules reached step 5, and the class won on specificity. Neither change broke the page on its own."),

        h2("4. Specificity: three columns, not one number"),
        p("When two declarations reach step 5, the browser compares the specificity of their selectors. Selectors Level 4 defines specificity as a triple **(A, B, C)**:"),
        bullets([
            "**A**: the number of id selectors, such as `#pay`.",
            "**B**: the number of class selectors (`.btn`), attribute selectors (`[type=\"submit\"]`, `[disabled]`) and pseudo-classes (`:hover`, `:disabled`, `:nth-child(2n+1)`).",
            "**C**: the number of type selectors (`button`, `h1`) and pseudo-elements (`::before`, `::placeholder`).",
            "The universal selector `*` and the combinators (space, `>`, `+`, `~`) add nothing.",
        ]),
        p("Two triples are compared **column by column**: the larger A wins; only if A is equal does B count; only if B is equal too does C count. There is no carrying from one column to the next, so it is not a base-10 number. One id beats any number of classes, and one class beats any number of type selectors."),
        code("css", `
/* selector                            A  B  C */
li                                  /* 0, 0, 1 */
.cart-item                          /* 0, 1, 0 */
header nav a:hover                  /* 0, 1, 3 */
.summary > .row + .row              /* 0, 3, 0 */
a[href^="https"]::after             /* 0, 1, 2 */
#order-summary                      /* 1, 0, 0 */
#order-summary .total               /* 1, 1, 0 */
*                                   /* 0, 0, 0 */`, "specificity.css"),
        h3(":is(), :not(), :has() and :where()"),
        p("These pseudo-classes take a list of selectors as their argument. They do not count as a pseudo-class themselves:"),
        bullets([
            "`:is()`, `:not()` and `:has()` count as their **most specific argument**, no matter which argument actually matched. `:is(.cart, #wishlist) li` is (1,0,1), even for a list item that is only inside `.cart`.",
            "`:where()` always counts **zero**, whatever is inside it. `:where(#wishlist, .cart) li` is (0,0,1). This makes `:where()` the tool for defaults that should be easy to override.",
            "`:nth-child(An+B of S)` counts as a pseudo-class plus its most specific selector in S.",
        ]),
        code("css", `
:is(.cart, #wishlist) li          /* 1, 0, 1 - the id counts, even inside .cart */
:where(.cart, #wishlist) li       /* 0, 0, 1 - :where() adds nothing             */
.field:has(input:invalid)         /* 0, 2, 1 - .field plus input:invalid          */`, "functional.css"),
        p("A common slip is to count `:has` as one more pseudo-class. It adds nothing itself; it counts its argument. `input:invalid` is (0,1,1), so `.field:has(input:invalid)` is (0,1,0) + (0,1,1) = (0,2,1), not (0,3,1)."),
        callout("tip", "Low specificity is a feature",
            "The lower your selectors' specificity, the easier they are to override later. Design systems increasingly wrap their defaults in :where() so that any single class in your code beats them. Prefer one class per rule, and avoid ids in style sheets."),

        h2("5. !important is a different step, not a bigger number"),
        p("`!important` does not change specificity. It moves the declaration into a different group at step 1: every important declaration beats every normal declaration of the same origin, whatever their selectors or layers. Inside the important group, the remaining steps run again - style attribute, layers (reversed), specificity, order."),
        p("That is why the hotfix broke the disabled state. `.btn:disabled` is a normal declaration, so it can no longer beat an important one, however specific it is. Within your own CSS, the only way left to override an important declaration is another important declaration that wins one of the later steps: a `style` attribute with `!important`, an earlier layer, a higher specificity or a later position. That is how an **!important war** starts: each fix needs a stronger `!important` than the last, until nobody can predict what a rule does."),
        code("css", `
/* a typical war, three commits apart */
.btn-primary { background: #1d4ed8 !important; }
.checkout .btn:disabled { background: #cbd5e1 !important; }       /* fix for the fix */
#pay.btn-primary:not(:disabled) { background: #1d4ed8 !important; } /* and again */`, "checkout.css"),
        callout("warning", "Inline styles do not win everything",
            "A normal declaration in a style attribute beats every normal selector, but it loses to any !important declaration in a style sheet. A style attribute with !important beats every important rule with a selector in your style sheets. If you find yourself writing either, the real problem is usually earlier in the cascade."),

        h2("6. Cascade layers"),
        p("A **cascade layer** groups rules so that the whole group can be ordered against other groups, independently of specificity. The order is fixed by the **first time** each layer name appears, so the usual pattern is one `@layer` statement at the very top of the first style sheet:"),
        code("css", `
/* app.css - the first CSS the page loads */
@layer reset, base, components, utilities;

@layer base {
  a { color: #1d4ed8; }
}
@layer utilities {
  .text-muted { color: #475569; }      /* beats every rule in base and components */
}
@layer components {                     /* adds to the existing layer; does not move it */
  .card a { color: #0f766e; }
}`, "app.css"),
        p("The rules, for normal declarations:"),
        bullets([
            "A later layer beats an earlier one, **whatever the specificity**. `.text-muted` in `utilities` beats `#order-summary a` in `components`.",
            "Styles that are in **no layer** beat styles in **every** layer. This is what happened in the incident: the date picker's `form button` was unlayered.",
            "Inside one layer, specificity and order of appearance decide as usual.",
        ]),
        p("For `!important` declarations the layer order is reversed: an important declaration in an earlier layer beats one in a later layer, and an important declaration in any layer beats an important unlayered one. The reason is protection: a `reset` layer can mark a few declarations `!important` and know that nothing declared later overrides them by accident."),
        h3("Putting third-party CSS into a layer"),
        p("`@import` can put a whole style sheet into a layer. This is how you tame CSS you do not control:"),
        code("css", `
@layer reset, vendor, base, components, utilities;
@import url("/vendor/datepicker.min.css") layer(vendor);
@import url("/ds/ds-v4.css") layer(components);`, "app.css"),
        bullets([
            "`@import` rules must come before every other rule in the file; only `@charset` and `@layer` statements may come before them.",
            "Declare the layer name in the first `@layer` statement. A layer name that appears for the first time in a later file is added **after** all existing layers, so it would beat them.",
            "In DevTools, a layered rule shows its layer name above it in the Styles pane, which makes the order easy to check.",
        ]),

        h2("7. Inheritance is not the cascade"),
        p("The cascade decides between declarations that target the element itself. **Inheritance** only happens when, for an inherited property, no declaration is left for the element at all: then it takes its parent's computed value. Properties such as `color`, `font-family` and `line-height` inherit; `background`, `border`, `margin` and `padding` do not. Because an inherited value is not a declaration, any rule that matches the element beats it, even `* { color: black; }` with specificity (0,0,0). That is why a heading inside a dark card can stay black: the card sets `color`, but a rule like `h2 { color: #0f172a; }` matches the heading itself. The keywords `inherit`, `initial`, `unset`, `revert` and `revert-layer` let a declaration ask for a value explicitly instead."),

        h2("8. The fix: order the layers, drop !important"),
        p("The fix does not fight the date picker's selector. It puts the whole vendor file into its own early layer, so every rule the team writes in a later layer beats it, and it deletes the hotfix:"),
        code("css", `
/* app.css - loaded first, on every page */
@layer reset, vendor, base, components, utilities;
@import url("/ds/ds-v4.css") layer(components);

/* checkout.css - linked after app.css */
@import url("/vendor/datepicker.min.css") layer(vendor);
/* the !important hotfix is gone */`, "app.css + checkout.css"),
        code("html", `
<!-- checkout.html: no separate <link> for the date picker any more -->
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/checkout.css">`, "checkout.html"),
        p("Now walk the cascade again. Enabled: `form button` (vendor) and `.btn-primary` (components) differ at step 4, and components was declared later: blue. Disabled: `.btn-primary` and `.btn:disabled` are both in components, so step 5 decides: (0,2,0) beats (0,1,0), and the button is grey and dim exactly when it should be. The date picker's month arrows still get their grey background, as long as nothing in a later layer targets them."),
        p("The important point is that the result no longer depends on which file happens to be linked on which page, or on how specific a vendor's selectors are. To make that kind of reasoning reliable, write the cascade yourself. Given the layer order and every declaration for one property on one element, find the winner:"),
        code("javascript", `
cascadeWinner(["reset", "vendor", "base", "components", "utilities"], [
  { selector: "form button",   value: "#e5e7eb", layer: "vendor",     important: false },
  { selector: ".btn-primary",  value: "#1d4ed8", layer: "components", important: false },
  // ... a style attribute is { selector: null, inline: true, layer: null, ... }
]);
// -> { index, value, specificity: [A, B, C] }  (specificity is null for a style attribute)`),
        challenge("chal_coding_webf_212", "Turn each declaration into a list of numbers you can compare from left to right: importance, inline, a layer rank (unlayered gets the highest rank; negate the rank for !important so earlier layers win), then A, B, C, then the index. For specificity, walk the selector and look at what starts at each position: #, ., [, ::, : or a letter. For :is, :not and :has, split the text inside the parentheses on commas, score each part with the same function and keep the largest, compared column by column; skip :where entirely."),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**Any new `!important` outside a reset or utility layer.** Ask which declaration it is fighting and why that declaration wins. The answer is almost always a layer or a specificity problem that `!important` hides.",
            "**Third-party CSS linked as a plain file** in a project that uses layers. Unlayered vendor CSS beats all of your layered CSS. Import it with `layer(vendor)`, or keep your own CSS unlayered too.",
            "**A layer name first used in a later file.** `@import url(...) layer(widgets);` in a page-specific file creates `widgets` after `utilities` unless the first `@layer` statement already listed it.",
            "**Ids in selectors, or long chains such as `.page .main .content .btn`.** Every extra selector makes the rule harder to override. `.btn` in the right layer is enough.",
            "**Counting specificity as a single number.** `(1,0,0)` beats `(0,15,0)`. And remember the per-argument rules: `:is(#a, .b)` is (1,0,0), `:where(#a)` is (0,0,0).",
            "**Selector lists.** `.btn, #pay { ... }` is two selectors with their own specificity; each element gets the specificity of the selector that matched it. Wrapping the list in `:is()` changes that.",
            "**Shorthands.** `background: #e5e7eb` sets `background-color` and resets every other background longhand, such as `background-image`. A shorthand in a winning rule can wipe out a longhand you set elsewhere.",
            "**`revert-layer` instead of a counter-rule.** Inside a layer, `background: revert-layer;` rolls the value back to what the earlier layers decided, which is often cleaner than repeating the old value.",
        ]),

        h2("10. Checklist"),
        bullets([
            "The first style sheet the page loads declares every layer in one statement, such as `@layer reset, vendor, base, components, utilities;`.",
            "Third-party CSS is imported into an early layer with `@import url(...) layer(vendor);`, never linked unlayered next to layered code.",
            "When a style does not apply, you inspect it in DevTools: the struck-through declaration, the `@layer` label and the specificity tell you which step of the cascade decided.",
            "You compare specificity column by column (ids, then classes/attributes/pseudo-classes, then types/pseudo-elements), counting `:is`, `:not` and `:has` as their most specific argument and `:where` as zero.",
            "`!important` appears only where it is a deliberate rule (for example a reset or a utility that must always win), and you remember that it reverses the layer order.",
            "State styles such as `:disabled`, `:hover` and `[aria-invalid=\"true\"]` live in the same layer as the component they belong to, so specificity, not file order, lets them win.",
            "You know that inheritance is only a fallback: any rule that matches the element, however weak, beats an inherited value.",
        ]),
    ],
});
