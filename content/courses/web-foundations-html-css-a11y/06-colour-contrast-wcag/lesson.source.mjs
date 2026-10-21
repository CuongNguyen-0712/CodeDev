// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-3-1",
    title: "Colour contrast: computing WCAG ratios",
    slug: { _type: "slug", current: "colour-contrast-computing-wcag-ratios" },
    description:
        "A brand refresh ships light grey body text and white text on a bright orange Checkout button; older customers complain and a public-sector client's accessibility audit fails the release. Learn how WCAG 2.2 computes relative luminance and contrast ratios, which thresholds apply to normal text, large text and UI parts, and how to pair colours as design tokens so every combination passes.",
    estimatedTime: 25,

    scenario: {
        role: "Front-end developer, storefront platform team",
        problem:
            "Release 4.0 of the storefront theme rolled out a brand refresh: body text in #9ca3af on white, a white-on-#f97316 Checkout button and 1px input borders in #d1d5db. Within two weeks support logged 46 tickets, most from customers over 60 (\"the text is too faint\", \"I could not find the checkout button outside\"). Then the platform's public-sector client, a university bookshop contractually bound to WCAG 2.2 AA, sent back its audit: release 4.0 fails 1.4.3 Contrast (Minimum) on body text (2.54:1) and the Checkout button (2.80:1), and 1.4.11 Non-text Contrast on every form field (1.47:1).",
    },

    content: [
        h2("1. The incident: a brand refresh that nobody could read"),
        p("The design review looked at the new theme on a calibrated 27-inch monitor in a dim room, and it looked calm and modern. This is the CSS that shipped:"),
        code("css", `
/* theme-4.0.css */
body {
  background: #ffffff;
  color: #9ca3af;              /* "soft grey" body text, 16px */
  font-size: 1rem;
}

.btn-checkout {
  background: #f97316;         /* new brand orange */
  color: #ffffff;
  font-size: 1.125rem;         /* 18px */
  font-weight: 700;
}

input, select {
  border: 1px solid #d1d5db;   /* "subtle" field borders */
}

input::placeholder {
  color: #d1d5db;
}`, "theme-4.0.css"),
        p("Nothing here is invalid CSS, and no linter complains. The problem is a number that nobody computed: how far apart the two colours of each pair are in **relative luminance**. The audit report gave three of those numbers - 2.54:1, 2.80:1 and 1.47:1 - and every one is below the minimum that WCAG 2.2 level AA asks for. By the end of this lesson you will compute them yourself, by hand and in code."),

        h2("2. Reproduce it: see the numbers and the problem"),
        p("You do not need an audit firm to find these failures. Open the storefront in Chrome or Edge and try four things:"),
        numbered([
            "**The colour picker.** Inspect a paragraph, find `color: #9ca3af` in the Styles pane and click the small colour swatch. The picker shows a **Contrast ratio** line: 2.54, with a warning icon. Expand it to see the AA and AAA verdicts. The picker also draws curved lines across the colour area: every colour on the far side of a line meets that level against the current background, so you can drag the colour across the line and watch the ratio change.",
            "**An automated audit.** Run Lighthouse (Accessibility category) or the axe DevTools extension. Both report \"Background and foreground colors do not have a sufficient contrast ratio\" and list each failing element with its ratio.",
            "**A blurred view.** In DevTools, open the Rendering panel and choose **Emulate vision deficiencies: Blurred vision**. The grey body text turns into a light smear long before the black headings do.",
            "**A phone in daylight.** Open the page on a phone, outdoors, with the screen brightness at half. The orange button with white text is the first thing to wash out.",
        ]),
        callout("info", "Where the tools need help",
            "DevTools and axe compute the ratio from the colours they can determine. When text sits on a gradient, a background image or a semi-transparent layer, they often cannot know the colour behind each letter and report \"needs review\" instead of a number. Those cases need a manual check, covered in section 7."),

        h2("3. Who contrast is for"),
        p("Contrast is not a niche requirement. The 4.5:1 minimum was chosen to account for moderately low visual acuity, colour vision deficiencies and the loss of contrast sensitivity that usually comes with ageing - conditions many people live with without ever calling them a disability:"),
        bullets([
            "**People with low vision** who read the screen without assistive technology, often zoomed in. A screen reader does not help someone who simply sees faint text as fainter.",
            "**Ageing eyes.** Contrast sensitivity declines with age, and the lens of the eye scatters more light. Most of the 46 tickets came from customers over 60.",
            "**People with colour vision deficiencies**, roughly 1 in 12 men and 1 in 200 women. Luminance contrast still works when hue differences do not.",
            "**Everyone, some of the time:** a phone in sunlight, a cheap laptop panel viewed at an angle, a dimmed screen at night, a projector in a bright meeting room.",
        ]),

        h2("4. Relative luminance, step by step"),
        p("WCAG does not compare colours by hue or by how \"dark\" they look in a colour picker. It compares their **relative luminance** (L): the brightness of a colour on a scale from 0 for black to 1 for white, weighted the way the human eye responds to red, green and blue light. Here is the full calculation for the incident's body text, `#9ca3af`:"),
        numbered([
            "**Read the hex.** `#9ca3af` is three bytes: `9c` = 156 red, `a3` = 163 green, `af` = 175 blue. A three-digit colour is shorthand with each digit doubled: `#f60` is `#ff6600`.",
            "**Scale each channel to 0-1** by dividing by 255: 156 / 255 = 0.612, 163 / 255 = 0.639, 175 / 255 = 0.686.",
            "**Linearise.** Screen values are gamma-encoded (sRGB): a value of 0.5 does not emit half the light of 1.0. Undo the encoding for each channel: if c <= 0.04045, use c / 12.92; otherwise use ((c + 0.055) / 1.055) raised to the power 2.4. Here: 0.333, 0.366 and 0.429.",
            "**Weight and add.** L = 0.2126 R + 0.7152 G + 0.0722 B, using the linearised values. The eye is far more sensitive to green than to blue, so green contributes about ten times as much as blue. For `#9ca3af`, L = 0.364.",
        ]),
        code("text", `
channel   0-255   / 255    linearised   weight    contribution
R          156    0.612      0.333      0.2126       0.0707
G          163    0.639      0.366      0.7152       0.2620
B          175    0.686      0.429      0.0722       0.0310
                                                L =  0.3636     (white: L = 1, black: L = 0)`, "relative luminance of #9ca3af"),
        callout("info", "0.04045 or 0.03928?",
            "Older versions of the WCAG text used 0.03928 as the linearisation threshold. WCAG 2.2 uses 0.04045, as in the sRGB standard. No 8-bit channel value falls between the two thresholds, so for hex colours the result is the same either way."),
        p("The weights explain why some colours surprise designers. Pure blue `#0000ff` looks dark and strong, and its luminance is only 0.0722, so white on pure blue is a comfortable 8.59:1. Pure yellow `#ffff00` looks bright and warm, and its luminance is 0.93, so yellow text on white is an unreadable 1.07:1. Averaging R, G and B would get both of those badly wrong."),

        h2("5. The contrast ratio and the WCAG thresholds"),
        p("With two luminances, the contrast ratio is:"),
        code("text", `
ratio = (L1 + 0.05) / (L2 + 0.05)      L1 = the lighter colour, L2 = the darker one`),
        p("The 0.05 added to both sides models the light that reflects off any screen, and it keeps the ratio finite when L2 is 0. The result runs from **1:1** (two identical colours) to **21:1** (black on white: 1.05 / 0.05). For the incident's body text: (1 + 0.05) / (0.3636 + 0.05) = 2.54:1. Because L1 is always the lighter colour, swapping text and background gives the same ratio: white on grey and grey on white are equally readable."),
        image("contrast-ratio-pipeline", {
            alt: "Diagram in two rows. The top row shows five steps for #9ca3af on white: read the hex as 156, 163, 175; scale to 0.612, 0.639, 0.686; linearise to 0.333, 0.366, 0.429; weight and add to L = 0.364; compare with white to get 1.05 / 0.414 = 2.54. The bottom row sorts colour pairs into four bands: below 3:1 fails every rule (the incident's body text 2.54, button 2.80 and input border 1.47); 3:1 to under 4.5:1 is enough only for large text and UI parts (#8a8a8a 3.45, #777777 4.48); 4.5:1 to under 7:1 is AA for all text (#767676 4.54, #6b7280 4.83, white on #c2410c 5.18); 7:1 and above is AAA for all text (#374151 10.31, black on white 21).",
            caption: "Relative luminance turns each colour into one number; the ratio of the two numbers decides pass or fail. Ratios are never rounded up: 4.48:1 fails 4.5:1.",
        }),
        h3("Which threshold applies"),
        bullets([
            "**1.4.3 Contrast (Minimum), level AA:** text and images of text need at least **4.5:1**, or **3:1** for large text.",
            "**1.4.6 Contrast (Enhanced), level AAA:** at least **7:1**, or **4.5:1** for large text.",
            "**Large text** means at least 18 point regular or 14 point bold. CSS uses 96 px per inch and 72 pt per inch, so 1pt = 4/3 px: large is at least **24px** regular, or at least **18.67px** (14 x 4/3 = 18.666...) bold. Bold usually means `font-weight: 700` or heavier. The incident's 18px bold Checkout label is therefore normal-size text and needs 4.5:1 - and at 2.80:1 it would fail even the 3:1 large-text minimum.",
            "**1.4.11 Non-text Contrast, level AA:** at least **3:1** against adjacent colours for the visual information needed to identify user interface components and their states - the border of a text field when it is the only sign of the field, a checkbox outline, a keyboard focus indicator, an icon-only button's icon - and for parts of graphics needed to understand them, such as chart lines. There is no AAA level for non-text contrast.",
        ]),
        callout("warning", "There is no rounding up",
            "The thresholds are minimums. #777777 on white is 4.478:1, which DevTools displays as 4.48 and which fails 4.5:1. #767676 on white is 4.542:1 and passes. A colour pair at 4.497:1 may even be displayed as 4.50 by a tool that rounds to two decimals - it still fails. Round only for display; decide pass or fail on the exact value."),
        p("Before you write any code, check that you can apply these rules to the cases the audit raised:"),
        challenge("chal_quiz_webf_311"),

        h2("6. Build your own contrast checker"),
        p("Design-system teams often run contrast checks in CI: every token pair in the theme is checked on each pull request, so a refresh like release 4.0 cannot be merged with failing pairs. The heart of such a check is a small, exact function. It takes the two colours and the context of the text, and reports the ratio and the verdicts:"),
        code("javascript", `
contrastReport("#9ca3af", "#ffffff", { sizePx: 16, bold: false, kind: "text" });
// -> { ratio: <rounded for display>, large: false, aa: <pass?>, aaa: <pass?> }

contrastReport("#d1d5db", "#ffffff", { kind: "ui" });      // an input border: only the 3:1 rule
// -> { ratio: <rounded for display>, large: false, aa: <pass?>, aaa: null }`, "contrast.js"),
        p("The contract in the starter file spells out every detail: which colour formats are valid (and that everything else must throw, because a checker that guesses is worse than none), how to round the displayed ratio, the exact large-text thresholds, and why `aaa` is `null` for UI parts. Write it:"),
        challenge("chal_coding_webf_312", "Normalise each colour first: validate it with one regular expression anchored with ^ and $ (and the i flag), expand a three-digit colour to six digits, then work only with numbers. Compute both luminances and put the larger one on top, so the order of the arguments stops mattering. Keep the exact ratio in its own variable for every pass/fail comparison and round only the value you return. Test your large-text check with 18px, 18.5px bold, 19px bold and 24px."),

        h2("7. Placeholders, disabled controls, images and colour alone"),
        h3("Placeholder text must pass; disabled controls are exempt"),
        p("1.4.3 exempts text that is part of an **inactive user interface component** - a disabled button or field - along with pure decoration, invisible text, text that is incidental in a photo, and logotypes. It does **not** exempt placeholder text. The theme's `#d1d5db` placeholder (1.47:1) fails, and placeholder text has a second problem: it disappears as soon as the user types, so it must never be the only label or the only hint. Give the placeholder a passing colour, and keep instructions in a real label or description."),
        p("The exemption for disabled controls is not a reason to disable things. A greyed-out \"Place order\" button with no explanation is hard to see and gives no clue what is missing. Often it is better to keep the button enabled and show clear error messages on submit."),
        h3("Text over images"),
        p("For a heading on a hero photo, the background is not one colour. The text must reach the ratio against the **lightest** (or, for dark text, the darkest) part of the image behind it, and automated tools usually cannot compute that. The reliable fix is to control the background: a solid panel behind the text, or a dark overlay that you can measure:"),
        code("css", `
.hero {
  /* a 65% black overlay on top of the photo, under the text */
  background:
    linear-gradient(rgb(0 0 0 / 0.65), rgb(0 0 0 / 0.65)),
    url("/img/autumn-sale.jpg") center / cover;
  color: #ffffff;
}`, "hero.css"),
        p("With the overlay, even a pure white area of the photo becomes `#595959` at most, and white text on `#595959` is 7.00:1. Check the result in the picker by sampling the lightest point behind the text."),
        h3("1.4.1 Use of Color"),
        p("Contrast measures lightness, not meaning. 1.4.1 Use of Color (level A) says colour must not be the **only** visual means of conveying information. An invalid field shown only by a red border, or a link inside a paragraph distinguished only by its blue colour, fails for people who cannot tell those hues apart - however good the contrast is. Add a second signal: an error icon and message, an underline on links in body text."),

        h2("8. The fix: colours as pairs, not swatches"),
        p("Release 4.0 failed because the palette was designed as a list of individual colours. The fix is to define colours as **pairs**: every foreground token is named for the background it sits on, and every pair is checked. The bookshop's re-audit passed with these tokens:"),
        code("css", `
/* tokens.css - each foreground is paired with the background it is used on */
:root {
  --surface:        #ffffff;
  --text:           #374151;   /* on --surface: 10.31:1  (AAA) */
  --text-muted:     #6b7280;   /* on --surface:  4.83:1  (AA)  */
  --placeholder:    #6b7280;   /* on --surface:  4.83:1  (AA)  */
  --border-input:   #8a8a8a;   /* on --surface:  3.45:1  (1.4.11) */
  --focus-ring:     #1d4ed8;   /* on --surface:  6.70:1  (1.4.11) */

  --action:         #c2410c;   /* a deeper orange for the Checkout button */
  --on-action:      #ffffff;   /* on --action:   5.18:1  (AA)  */
}

body           { background: var(--surface); color: var(--text); }
.hint          { color: var(--text-muted); }
input, select  { border: 1px solid var(--border-input); }
::placeholder  { color: var(--placeholder); }
.btn-checkout  { background: var(--action); color: var(--on-action); }
:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }`, "tokens.css"),
        bullets([
            "**The body text** moved from 2.54:1 to 10.31:1. It still reads as a soft dark grey, not black.",
            "**The Checkout button** keeps an orange identity. The brand team had a second passing option: keep `#f97316` and make the label dark, `#1f2937` (5.24:1). White on the bright orange was the one combination that could not pass.",
            "**The field borders** are the minimum change for 1.4.11: 3.45:1 against the white page.",
            "**The focus ring** is drawn with a 2px offset, so its adjacent colour is the white page, not the orange button: 6.70:1.",
            "**A dark theme** redefines the same token names with its own values, and every pair is checked again in that theme. Hover, active, visited and error states are pairs too.",
        ]),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**\"It rounds to 4.5.\"** It fails. Compare the exact ratio; round only the number you display.",
            "**18px is not 18pt.** Large text starts at 24px regular or about 18.67px bold. A 20px regular heading needs 4.5:1, not 3:1.",
            "**Checking against the wrong background.** Text on a button, a card or a banner is checked against that surface, not against the page.",
            "**Transparency and opacity.** `color: rgb(55 65 81 / 0.6)` or `opacity: 0.6` on a text element changes the colour the eye sees: the ratio must be computed on the blended result, which is always lower than that of the opaque colour.",
            "**Only the default state was checked.** Placeholder, hover, visited, error and dark-theme colours are separate pairs, and they are where failures hide.",
            "**Thin fonts.** The WCAG 2.2 ratio does not take font weight or size into account beyond the large-text rule, so a 300-weight grey at 14px can pass on paper and still be hard to read. APCA (Accessible Perceptual Contrast Algorithm) is one method being explored for a future WCAG version that models this; it is not part of WCAG 2.2, and audits today are made against the ratio in this lesson.",
            "**Colour as the only signal.** A red border without text or an icon fails 1.4.1 Use of Color, whatever its contrast.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Normal text reaches at least 4.5:1 against its actual background; large text (24px regular, 18.67px bold) at least 3:1.",
            "Pass or fail is decided on the exact ratio; nothing between 4.4 and 4.5 is treated as a pass.",
            "Input borders that identify a field, focus indicators, icon-only buttons and meaningful chart lines reach 3:1 against adjacent colours (1.4.11).",
            "Placeholder text passes 4.5:1 and never replaces a label; disabled controls are exempt but used sparingly.",
            "Text over images sits on a solid panel or a measured overlay, checked at the lightest point.",
            "No information is conveyed by colour alone (1.4.1): errors have text or icons, links in body text are underlined.",
            "Colours are defined as foreground/background token pairs, every pair is checked in every theme and state, ideally in CI.",
            "Spot-check with the DevTools colour picker's contrast ratio and lines, and run Lighthouse or axe on every release.",
        ]),
    ],
});
