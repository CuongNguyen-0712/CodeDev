// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-1-2",
    title: "Forms that work: labels, validation & error messages",
    slug: { _type: "slug", current: "forms-labels-validation-error-messages" },
    description:
        "A sign-up form redesign replaced labels with hints inside the boxes and marked errors with a red border: screen readers announced \"edit text, blank\", autofill stopped working and sign-up completion fell from 62% to 41%. Learn how every control gets a programmatic name, how to group radios, which autocomplete tokens to use, how native validation and :user-invalid work, and how to write errors that everyone can find and fix.",
    estimatedTime: 22,

    scenario: {
        role: "Frontend developer, growth team of a language-learning app",
        problem:
            "The new sign-up form looked cleaner: no labels above the fields, just grey hints inside the boxes that slide away when you click, and a red border on every field that fails validation. In the nine days after release, sign-up completion fell from 62% to 41% - about 3,800 people who started the form and never finished it. Among visitors whose browser or password manager used to fill the form for them, completion dropped from 74% to 39%. Support received 31 tickets: a blind user whose screen reader announced every field as \"edit text, blank\", several people whose password manager filled their email into the name field, and a colour-blind user who pressed \"Create account\" six times because nothing on the page told her which field was wrong.",
    },

    content: [
        h2("1. The incident: a form that only looks finished"),
        p("This is the markup that shipped. The design system's new field component draws its hint in a `<span>` laid over the input, and the developer who migrated the form renamed the fields to match the component's generated names:"),
        code("html", `
<form class="signup" novalidate>
  <div class="field">
    <span class="hint">Email</span>
    <input type="text" name="f1">
  </div>
  <div class="field">
    <input type="text" name="f2" placeholder="Full name">
  </div>
  <div class="field">
    <span class="hint">Password</span>
    <input type="password" name="f3">
  </div>
  <div class="field">
    <span class="hint">Date of birth (DD/MM/YYYY)</span>
    <input type="text" name="f4">
  </div>
  <div class="plan">
    Plan:
    <input type="radio" name="plan" value="free"> Free
    <input type="radio" name="plan" value="pro"> Pro
  </div>
  <button>Create account</button>
</form>`, "signup.html"),
        code("css", `
.field:focus-within .hint { opacity: 0; }        /* the hint slides away on focus */
.field input.has-error { border-color: #dc2626; } /* the only sign of an error */`, "signup.css"),
        p("On screen, every field has a word in it, and an invalid field turns red. But none of that text is **connected** to the fields. To the browser, the email field is an anonymous text box; the hint is a span that happens to be drawn on top of it. The red border tells nobody what is wrong. And the `name=\"email\"` and `autocomplete` attributes that browsers and password managers used to recognise the fields were gone. Every one of the 31 tickets comes from that gap between what the form shows and what it says in code."),

        h2("2. Reproduce it"),
        p("You can see every symptom on your own machine in a few minutes:"),
        numbered([
            "**Look at the accessibility tree.** In Chrome or Edge DevTools, select the email input and open the **Accessibility** pane: under Computed Properties the **Name** is empty. Firefox has the same in its Accessibility Inspector.",
            "**Listen to it.** Start a screen reader - NVDA on Windows is free, VoiceOver on macOS starts with Cmd+F5 - and press Tab into the form. The fields are announced only by their role and value, roughly \"edit text, blank\". The radios say \"radio button, not checked\" with no word about the plan.",
            "**Click the hint.** Click the word \"Email\" itself. With a real label, clicking it focuses the field; here nothing happens. Clicking \"Free\" does not select the radio either.",
            "**Simulate colour vision deficiency.** Submit an empty form, then open the DevTools **Rendering** panel and choose **Emulate vision deficiencies** - try deuteranopia and achromatopsia. The red borders look like every other border.",
            "**Run an automated check.** Lighthouse's accessibility audit or the axe DevTools extension flags form fields without labels. Automated tools differ in whether they accept a placeholder as a name, so treat a pass as \"no obvious failure\", not as proof.",
        ]),

        h2("3. Every control needs a name"),
        p("Every form control has an **accessible name**: the text that assistive technology uses to identify it. WCAG 2.2 requires it in two places: **4.1.2 Name, Role, Value** (the name must be available to software) and **3.3.2 Labels or Instructions** (users must be told what to enter). The native, reliable way to give a control a name is a `<label>`."),
        h3("label for, or a wrapping label"),
        code("html", `
<!-- 1. for points at the control's id -->
<label for="signup-email">Email address</label>
<input id="signup-email" name="email" type="email">

<!-- 2. the label wraps the control: no id needed -->
<label>
  <input type="checkbox" name="terms" required>
  I accept the terms of service
</label>`, "labels.html"),
        bullets([
            "`for` matches the control's **id**, never its `name`. The `name` attribute is only the key the server receives with the value. A label whose `for` matches nothing labels nothing, silently.",
            "A label is also a bigger click target: clicking it focuses a text field or toggles a checkbox or radio.",
        ]),
        h3("A placeholder is not a label"),
        p("A `placeholder` looks like a label, but it behaves like a hint. It disappears as soon as the user types, it is usually light grey, and browsers use it as a name only as a last-resort fallback. Use a visible label for the name and visible text for instructions; a placeholder may show an example, but nothing important may live only there."),
        h3("aria-labelledby and aria-label"),
        p("ARIA gives two more ways to name a control. They override the native label, so use them only when a `<label>` cannot do the job:"),
        bullets([
            "**`aria-labelledby=\"id1 id2\"`** builds the name from the text of other elements on the page, in the order of the ids. Use it when the name is already visible elsewhere, for example a heading plus a column header.",
            "**`aria-label=\"...\"`** puts a name string on the control itself, invisible on screen. Use it for controls with no visible text, such as an icon-only search button. Sighted users never see it, so it cannot replace a visible label for a text field.",
        ]),
        p("When several sources exist, the browser takes the **first one that gives text**: `aria-labelledby`, then `aria-label`, then the native `<label>`, and only then fallbacks such as `title` or `placeholder`. Mixing them is a common source of bugs: the visible label says one thing and the screen reader says another. Keep the visible label text inside the name - **2.5.3 Label in Name** requires it, so that a voice control user who says \"click Email address\" reaches the field."),
        image("field-name-and-error-sources", {
            alt: "Before: a span hint over an input with a red border; a screen reader hears \"edit text, blank\". After: a label for the input's id, autocomplete, aria-invalid and aria-describedby pointing at a hint and an error; the screen reader hears the label, the invalid state and the error text. Below, the name sources in order: aria-labelledby, aria-label, label, then title or placeholder as fallbacks to treat as missing.",
            caption: "The name comes from the first source that gives text; the description adds hints and errors; aria-invalid adds the state. Text that is only drawn near a field - or only coloured - reaches nobody who cannot see it.",
        }),

        h2("4. Groups, autofill and not asking twice"),
        h3("fieldset and legend for radio groups"),
        p("Each radio button needs its own label (\"Free\", \"Pro\"), and the group needs a name too, or the user hears \"Pro, radio button\" without the question. `<fieldset>` groups the controls and its `<legend>` names the group, which screen readers announce when focus enters it - the structure **1.3.1 Info and Relationships** asks for:"),
        code("html", `
<fieldset>
  <legend>Choose a plan</legend>
  <label><input type="radio" name="plan" value="free" required> Free</label>
  <label><input type="radio" name="plan" value="pro"> Pro - 5 USD a month</label>
</fieldset>`, "plan.html"),
        p("Radios with the same `name` form one group: arrow keys move between them, and `required` on one radio makes the whole group required."),
        h3("autocomplete tokens"),
        p("Browsers and password managers fill forms by recognising what each field is for. The most reliable signal is the `autocomplete` attribute with a standard token. **1.3.5 Identify Input Purpose** (level AA) requires that the purpose of fields collecting information about the user can be determined by software, and these tokens are how you meet it:"),
        code("html", `
<input id="email" name="email"    type="email" autocomplete="email">
<input id="pw"    name="password" type="password" autocomplete="new-password">
<input id="dob"   name="birthday" type="date" autocomplete="bday">`, "autocomplete.html"),
        bullets([
            "`new-password` on a sign-up form tells password managers to suggest and save a new password; `current-password` on a log-in form tells them to fill the saved one.",
            "Other common tokens: `given-name`, `family-name`, `username`, `tel`, `street-address`, `postal-code`. Add `shipping` or `billing` in front when a form has two addresses.",
            "The right `type` helps too: `email` and `tel` bring up the matching keyboard on phones, and `date` gives a date picker instead of a DD/MM/YYYY guessing game.",
        ]),
        h3("3.3.7 Redundant Entry"),
        p("New in WCAG 2.2 at level A: information the user already entered in the same process must be filled in for them or offered for selection, not typed again. If step 3 of the sign-up asks for a billing email, pre-fill it with the account email or offer a \"same as account email\" checkbox. The exceptions are re-entry that is essential, re-entry required for security, and information that is no longer valid."),

        h2("5. Native validation and :user-invalid"),
        p("HTML can check most simple rules without any JavaScript. These attributes feed the browser's **constraint validation**:"),
        code("html", `
<input id="email" type="email" required>                 <!-- valueMissing, typeMismatch -->
<input id="pw" type="password" minlength="12" required>  <!-- tooShort -->
<input id="postcode" pattern="[0-9]{6}">                 <!-- patternMismatch -->
<input id="dob" type="date" min="1900-01-01" max="2026-10-21"> <!-- rangeUnderflow / rangeOverflow -->`, "constraints.html"),
        bullets([
            "`pattern` must match the **whole** value, not just part of it, and it is only checked when the field is not empty - combine it with `required` when the field is mandatory.",
            "`type=\"email\"` checks the syntax only, and the HTML rule is loose: `a@b` is a valid email address to the browser. It cannot tell you that a domain exists.",
            "Each control has a `validity` object (`valueMissing`, `typeMismatch`, `patternMismatch` ...), `checkValidity()`, and `setCustomValidity(message)` for rules HTML cannot express. The server must still validate again.",
        ]),
        h3(":invalid fires too early, :user-invalid waits for the user"),
        p("The `:invalid` pseudo-class matches any control that currently fails its constraints - including an empty `required` field on a page that just loaded. Styled red, it greets every visitor with errors they have not made. **`:user-invalid`** (Selectors Level 4) matches only after the user has interacted with the field - changed it and left it, or tried to submit - and works in all current major browsers:"),
        code("css", `
input:user-invalid {
  border-color: #b91c1c;
  border-width: 2px;          /* a change of shape, not only of colour */
}`, "validation.css"),
        p("Many forms add `novalidate` to the `<form>`, because the browser's own error bubbles cannot be styled and show one message at a time. The constraints still work - the `validity` object reports them - but now your code must show the errors properly. That is exactly where the incident went wrong."),

        h2("6. Error messages everyone can find and fix"),
        p("Three WCAG criteria describe a good error:"),
        bullets([
            "**3.3.1 Error Identification** (A): the field in error is identified, and the error is described to the user **in text**.",
            "**3.3.3 Error Suggestion** (AA): if you know how to fix it, say so - \"Enter a date in the past, like 21/03/1998\", not \"Invalid input\".",
            "**1.4.1 Use of Color** (A): colour may not be the only way information is shown. A red border can stay, as long as text (and ideally an icon or a thicker border) says the same thing.",
        ]),
        h3("Connect the message to the field"),
        code("html", `
<div class="field">
  <label for="pw">Create a password</label>
  <p id="pw-hint" class="hint">At least 12 characters.</p>
  <input id="pw" name="password" type="password" minlength="12" required
         autocomplete="new-password"
         aria-describedby="pw-hint pw-error" aria-invalid="true">
  <p id="pw-error" class="field-error">
    Error: the password is too short (8 of 12 characters).
  </p>
</div>`, "password-field.html"),
        bullets([
            "**`aria-describedby`** lists the ids of the hint and the error. Screen readers read the description after the name and role, so the user hears the rule and the problem without hunting for them.",
            "**`aria-invalid=\"true\"`** exposes the invalid state, usually announced as \"invalid entry\" or similar. Set it when the error is shown and remove it when the value is fixed - never on page load.",
            "The error text starts with a word (\"Error:\") or an icon with a text alternative, so it is not marked by colour alone.",
        ]),
        h3("An error summary that receives focus"),
        p("After a failed submit, users need to know that something went wrong, how many things, and how to reach each one. A summary at the top of the form that receives focus does all three:"),
        code("javascript", `
form.addEventListener("submit", (event) => {
  const invalid = [...form.elements].filter((el) => el.willValidate && !el.validity.valid);
  if (invalid.length === 0) return;            // valid: let the form submit

  event.preventDefault();
  for (const field of invalid) showFieldError(field);   // text + aria-invalid + aria-describedby
  renderSummary(invalid);   // <h2>There are 2 problems</h2> + one link per field: <a href="#pw">...</a>
  summary.focus();          // the summary container has tabindex="-1"
});`, "signup.js"),
        p("Each summary link repeats the error text and points at the field's id, so it moves focus straight to the field. Validate on submit and when the user leaves a field, not on every keystroke."),
        p("Now check what you would report about the shipped form, and how a name is chosen when several sources compete."),
        challenge("chal_quiz_webf_121"),

        h2("7. Audit names before release"),
        p("The growth team now runs a form audit in CI. A script exports every form as plain data - controls with their attributes, labels with `for` or the control they wrap, and the text of every element an ID list can point at - and a small function computes each control's name, where it comes from, and its description. The build fails when a field has no name."),
        p("The audit is deliberately stricter than a browser: a `placeholder` or `title` never counts as a name. Its first version passed the broken sign-up form, and on the fixed form it gives some fields the wrong label, cuts a two-id name in half and drops the password error. Fix it."),
        challenge("chal_fix_webf_122", "Run the failing tests and compare each step of accessibleName and textOfIds with the contract in the JSDoc, one source at a time. Names and descriptions share the ID-list helper, so a fix there serves both."),

        h2("8. The fix"),
        code("html", `
<form class="signup" novalidate aria-labelledby="signup-title">
  <h1 id="signup-title">Create your account</h1>

  <div id="error-summary" class="error-summary" tabindex="-1" hidden>
    <!-- filled on submit: a heading and one link per invalid field -->
  </div>

  <div class="field">
    <label for="signup-email">Email address</label>
    <p id="email-hint" class="hint">We send your receipt and lesson reminders here.</p>
    <input id="signup-email" name="email" type="email" autocomplete="email" required
           aria-describedby="email-hint">
  </div>

  <div class="field">
    <label for="signup-pw">Create a password</label>
    <p id="pw-hint" class="hint">At least 12 characters.</p>
    <input id="signup-pw" name="password" type="password" minlength="12" required
           autocomplete="new-password" aria-describedby="pw-hint">
  </div>

  <!-- full name and date of birth follow the same pattern: autocomplete="name" / "bday" -->

  <fieldset>
    <legend>Choose a plan</legend>
    <label><input type="radio" name="plan" value="free" required> Free</label>
    <label><input type="radio" name="plan" value="pro"> Pro - 5 USD a month</label>
  </fieldset>

  <button type="submit">Create account</button>
</form>`, "signup.html"),
        p("On submit, the script from section 6 adds an error paragraph under each invalid field, appends its id to `aria-describedby`, sets `aria-invalid=\"true\"`, then fills and focuses the summary. Every field has a visible label that is also its accessible name, hints stay on screen while the user types, the password manager sees `new-password`, and each error is a sentence that says what to do - in any colour, for any screen reader. Two weeks after the fix, sign-up completion was back at 63%, and 73% for visitors using autofill."),

        h2("9. Pitfalls to catch in code review"),
        bullets([
            "**`for` pointing at a `name`.** `<label for=\"email\">` with `<input name=\"email\" id=\"signup-email\">` labels nothing. Check that every `for` matches an existing id.",
            "**Placeholder or floating hint as the only label.** If the visible text disappears on focus or input, or lives in a span that is not a `<label>`, the field has no lasting label.",
            "**`aria-label` that disagrees with the visible label.** It overrides the label, breaks 2.5.3 Label in Name and confuses voice control users. Delete it when a `<label>` exists.",
            "**Styling `:invalid`.** The form is red before the user has typed anything. Use `:user-invalid`, or a class you add after submit.",
            "**Colour-only errors.** A red border, red label text or a red icon with no words fails 1.4.1. Every error needs text.",
            "**Error text that is not connected.** A message rendered next to the field but not referenced from `aria-describedby` is invisible to screen reader users who tab to the field.",
            "**Stale error descriptions.** Text referenced directly by `aria-describedby` can be read even if the element is hidden. Empty or remove the error message and its id when the value is fixed, and remove `aria-invalid` too.",
            "**Radios without a group.** No `<fieldset>`/`<legend>` and no per-option labels: the question is lost and the options are unnamed.",
            "**Missing `autocomplete` tokens.** Generated names like `f1` and no tokens leave autofill guessing, and the field's purpose is not identified as 1.3.5 asks.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every input, select and textarea has a visible `<label>` (for = the control's id, or wrapping it), and its accessible name in DevTools matches that text.",
            "Placeholders, if any, only show examples; instructions are visible text linked with `aria-describedby`.",
            "ARIA naming is used only where a label cannot work: `aria-labelledby` for names built from visible text, `aria-label` for controls with no visible text.",
            "Radio and checkbox groups are in a `<fieldset>` with a `<legend>`, and every option has its own label.",
            "Fields about the user have the right `type` and a standard `autocomplete` token; sign-up uses `new-password`, log-in `current-password`.",
            "Information entered earlier in the same process is pre-filled or offered, not asked for again (3.3.7).",
            "Rules are expressed with `required`, `type`, `minlength`, `pattern`, `min`/`max`; error styles use `:user-invalid`, never plain `:invalid`; the server validates again.",
            "Each error is text that says how to fix it, is linked with `aria-describedby`, sets `aria-invalid=\"true\"`, and is cleared when the value is fixed.",
            "On a failed submit, an error summary with links to each field receives focus.",
            "Tested with keyboard only, a screen reader, an emulated colour vision deficiency and an automated checker - and the form audit runs in CI.",
        ]),
    ],
});
