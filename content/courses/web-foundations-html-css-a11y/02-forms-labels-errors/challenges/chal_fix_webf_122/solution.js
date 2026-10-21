/**
 * Reference solution (never shipped to learners).
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

  // label[for] points at the control's id; the name attribute is only the form-data key
  const label = form.labels.find((l) => l.for === control.id || l.wraps === control.id);
  if (label && label.text.trim()) return { name: label.text.trim(), from: "label" };

  // a placeholder is not a label: no fallback to it
  return { name: "", from: "none" };
}

// Text of the elements an aria-labelledby / aria-describedby ID list points to.
function textOfIds(idList, text) {
  if (!idList) return "";
  return idList
    .trim()
    .split(/\s+/)
    .filter((id) => Object.hasOwn(text, id))
    .map((id) => text[id].trim())
    .filter(Boolean)
    .join(" ");
}
