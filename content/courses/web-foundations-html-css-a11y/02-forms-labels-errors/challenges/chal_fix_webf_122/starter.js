/**
 * Form auditor: computes what a screen reader announces for every control of a form -
 * its accessible name (and where the name comes from) and its description (hint and error text).
 *
 * Input: form = {
 *   controls: [{ id, type, name, attrs }, ...]      in document order
 *     id    - the control's id attribute (unique in the form)
 *     type  - "text", "email", "password", "tel", "checkbox", "radio", "select", ...
 *     name  - the name attribute: the key the server receives. It is NOT used for labelling.
 *     attrs - other attributes, every one optional, all strings: "aria-labelledby", "aria-label",
 *             "aria-describedby", "aria-invalid", "placeholder", "title", "autocomplete"
 *   labels: [{ for, text } or { wraps, text }, ...]
 *     for   - a <label for="x">: it labels the control whose ID is "x"
 *     wraps - a <label> that contains the control: it labels the control whose id is this value
 *     text  - the label's text. A label has either `for` or `wraps`, never both, and a control
 *             has at most one label.
 *   text: { [elementId]: string }   text of other elements on the page, by id (headings, hints,
 *                                   error messages), for aria-labelledby and aria-describedby
 * }
 *
 * ID lists: aria-labelledby and aria-describedby hold one or more ids separated by one or more
 * spaces. The text of an ID list = the text of every id that exists in form.text, in list order,
 * each trimmed, empty ones skipped, joined with one space. Ids that do not exist are ignored.
 * An ID list with no usable text gives "".
 *
 * Output: one object per control, in the order of form.controls:
 *   { id, name, from, description }
 *   name / from - the first of these sources that gives non-empty text:
 *     1. the text of the aria-labelledby ID list                      from: "aria-labelledby"
 *     2. aria-label, trimmed                                          from: "aria-label"
 *     3. its label (`for` or `wraps`), text trimmed                   from: "label"
 *     4. none of them: name "" and from "none". placeholder and title never count as a name -
 *        they are hints that disappear or hide, so the audit must report the field.
 *   description - the text of the aria-describedby ID list ("" when there is none).
 *
 * BUG: QA ran the auditor over the redesigned sign-up form and it reported every field as named -
 * "Email", "Password", "Full name" - while screen reader users could not tell the fields apart.
 * On the fixed form it gives some fields the wrong label or none at all, the phone field is
 * announced as just "Phone number", and the password error never shows up in the description.
 *
 * @param {{
 *   controls: { id: string, type: string, name: string, attrs?: Object<string, string> }[],
 *   labels: ({ for: string, text: string } | { wraps: string, text: string })[],
 *   text: Object<string, string>,
 * }} form
 * @returns {{ id: string, name: string, from: string, description: string }[]}
 */
function auditForm(form) {
  return form.controls.map((control) => {
    const attrs = control.attrs || {};
    const { name, from } = accessibleName(control, attrs, form);
    return { id: control.id, name, from, description: textOfIds(attrs["aria-describedby"], form.text) };
  });
}

function accessibleName(control, attrs, form) {
  const labelledBy = textOfIds(attrs["aria-labelledby"], form.text);
  if (labelledBy) return { name: labelledBy, from: "aria-labelledby" };

  const ariaLabel = (attrs["aria-label"] || "").trim();
  if (ariaLabel) return { name: ariaLabel, from: "aria-label" };

  const label = form.labels.find((l) => l.for === control.name || l.wraps === control.id);
  if (label && label.text.trim()) return { name: label.text.trim(), from: "label" };

  const placeholder = (attrs.placeholder || "").trim();
  if (placeholder) return { name: placeholder, from: "placeholder" };

  return { name: "", from: "none" };
}

// Text of the elements an aria-labelledby / aria-describedby ID list points to.
function textOfIds(idList, text) {
  if (!idList) return "";
  const id = idList.trim().split(/\s+/)[0];
  return Object.hasOwn(text, id) ? text[id].trim() : "";
}
