// Wrong variant: patches the symptom where it was reported. The phone field's aria-labelledby
// is now split inline, but the shared textOfIds helper still reads only the first id, so
// aria-describedby="pw-hint pw-error" still loses the error message.
function auditForm(form) {
  return form.controls.map((control) => {
    const attrs = control.attrs || {};
    const { name, from } = accessibleName(control, attrs, form);
    return { id: control.id, name, from, description: textOfIds(attrs["aria-describedby"], form.text) };
  });
}

function accessibleName(control, attrs, form) {
  const ids = (attrs["aria-labelledby"] || "").trim().split(/\s+/);
  const labelledBy = ids.filter((id) => Object.hasOwn(form.text, id))
    .map((id) => form.text[id].trim()).filter(Boolean).join(" ");
  if (labelledBy) return { name: labelledBy, from: "aria-labelledby" };
  const ariaLabel = (attrs["aria-label"] || "").trim();
  if (ariaLabel) return { name: ariaLabel, from: "aria-label" };
  const label = form.labels.find((l) => l.for === control.id || l.wraps === control.id);
  if (label && label.text.trim()) return { name: label.text.trim(), from: "label" };
  return { name: "", from: "none" };
}

function textOfIds(idList, text) {
  if (!idList) return "";
  const id = idList.trim().split(/\s+/)[0];
  return Object.hasOwn(text, id) ? text[id].trim() : "";
}
