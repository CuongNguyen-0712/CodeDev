// Wrong variant: fixes label[for] and the ID lists, but keeps the placeholder as a last-resort
// name ("browsers do it too"). The audit then passes the placeholder-only sign-up form that
// caused the incident - the one thing the auditor exists to catch.
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
  const label = form.labels.find((l) => l.for === control.id || l.wraps === control.id);
  if (label && label.text.trim()) return { name: label.text.trim(), from: "label" };
  const placeholder = (attrs.placeholder || "").trim();
  if (placeholder) return { name: placeholder, from: "placeholder" };
  return { name: "", from: "none" };
}

function textOfIds(idList, text) {
  if (!idList) return "";
  return idList.trim().split(/\s+/).filter((id) => Object.hasOwn(text, id))
    .map((id) => text[id].trim()).filter(Boolean).join(" ");
}
