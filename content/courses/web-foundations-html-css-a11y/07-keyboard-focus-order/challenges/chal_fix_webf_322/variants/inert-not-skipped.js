// Wrong variant: fixes the string comparison and the links without href, but still only
// checks `hidden`. The closed mini-cart drawer is marked inert, so its link and button
// must not be in the Tab sequence.
function tabOrder(root) {
  const NATIVE = ["a", "button", "select", "textarea", "input"];
  const CONTROLS = ["button", "input", "select", "textarea"];
  const positive = [];
  const zero = [];
  function visit(node) {
    const { tag, attrs } = node;
    if (attrs.hidden) return;
    const native = NATIVE.includes(tag) && !(tag === "input" && attrs.type === "hidden") && !(tag === "a" && attrs.href === undefined);
    const disabled = attrs.disabled === true && CONTROLS.includes(tag);
    const tabindex = attrs.tabindex !== undefined ? Number(attrs.tabindex) : native ? 0 : null;
    if (!disabled && tabindex !== null && tabindex >= 0) {
      if (tabindex > 0) positive.push({ id: node.id, tabindex });
      else zero.push(node.id);
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  positive.sort((a, b) => a.tabindex - b.tabindex);
  return [...positive.map((p) => p.id), ...zero];
}
