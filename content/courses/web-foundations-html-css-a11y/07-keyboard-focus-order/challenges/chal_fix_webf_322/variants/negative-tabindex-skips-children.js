// Wrong variant: treats tabindex="-1" like inert and stops at that element. But -1 only
// takes the element ITSELF out of the Tab sequence: the links inside <main tabindex="-1">
// (a skip-link target) are still reachable with Tab.
function tabOrder(root) {
  const NATIVE = ["a", "button", "select", "textarea", "input"];
  const CONTROLS = ["button", "input", "select", "textarea"];
  const positive = [];
  const zero = [];
  function visit(node) {
    const { tag, attrs } = node;
    if (attrs.hidden || attrs.inert) return;
    const native = NATIVE.includes(tag) && !(tag === "input" && attrs.type === "hidden") && !(tag === "a" && attrs.href === undefined);
    const disabled = attrs.disabled === true && CONTROLS.includes(tag);
    const tabindex = attrs.tabindex !== undefined ? Number(attrs.tabindex) : native ? 0 : null;
    if (tabindex !== null && tabindex < 0) return;
    if (!disabled && tabindex !== null) {
      if (tabindex > 0) positive.push({ id: node.id, tabindex });
      else zero.push(node.id);
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  positive.sort((a, b) => a.tabindex - b.tabindex);
  return [...positive.map((p) => p.id), ...zero];
}
