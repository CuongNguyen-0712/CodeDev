// Wrong variant: parses tabindex as a number and skips inert and links without href, but
// sorts every focusable element by its value in one list. 0 is smaller than 1, so the
// tabindex="0" and native elements come FIRST and the positive ones last.
function tabOrder(root) {
  const NATIVE = ["a", "button", "select", "textarea", "input"];
  const CONTROLS = ["button", "input", "select", "textarea"];
  const all = [];
  function visit(node) {
    const { tag, attrs } = node;
    if (attrs.hidden || attrs.inert) return;
    const native = NATIVE.includes(tag) && !(tag === "input" && attrs.type === "hidden") && !(tag === "a" && attrs.href === undefined);
    const disabled = attrs.disabled === true && CONTROLS.includes(tag);
    const tabindex = attrs.tabindex !== undefined ? Number(attrs.tabindex) : native ? 0 : null;
    if (!disabled && tabindex !== null && tabindex >= 0) all.push({ id: node.id, tabindex });
    for (const child of node.children) visit(child);
  }
  visit(root);
  return all.sort((a, b) => a.tabindex - b.tabindex).map((x) => x.id);
}
