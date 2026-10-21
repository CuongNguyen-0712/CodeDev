// Wrong variant: reads every id of the list, but does not skip ids that do not exist on the
// page. text[id] is undefined for them, and string concatenation turns it into the word
// "undefined" - a screen reader would announce "undefined Error: enter a date in the past."
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
  return { name: "", from: "none" };
}

function textOfIds(idList, text) {
  if (!idList) return "";
  let out = "";
  for (const id of idList.trim().split(/\s+/)) out += " " + text[id];
  return out.trim();
}
