// Wrong variant: resolves em against the root font size, as if em and rem were the same unit.
function resolveLength(value, ctx) {
  // One LENGTH token -> px.
  function length(token) {
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%|vw|vh|cqi)$/.exec(token);
    if (!match) throw new Error(`Unsupported length: "${token}"`);
    const n = Number(match[1]);
    switch (match[2]) {
      case "px": return n;
      case "rem": return n * ctx.rootFontSize;
      case "em": return n * ctx.rootFontSize;
      case "%": return (n * ctx.percentBasis) / 100;
      case "vw": return (n * ctx.viewport.width) / 100;
      case "vh": return (n * ctx.viewport.height) / 100;
      case "cqi": return (n * (ctx.container ? ctx.container.inlineSize : ctx.viewport.width)) / 100;
    }
  }

  // LENGTH, LENGTH + LENGTH or LENGTH - LENGTH (function arguments only).
  function expr(arg) {
    const tokens = arg.trim().split(/\s+/);
    if (tokens.length === 1) return length(tokens[0]);
    if (tokens.length === 3 && tokens[1] === "+") return length(tokens[0]) + length(tokens[2]);
    if (tokens.length === 3 && tokens[1] === "-") return length(tokens[0]) - length(tokens[2]);
    throw new Error(`Unsupported expression: "${arg}"`);
  }

  const text = value.trim();
  const call = /^(clamp|min|max)\((.*)\)$/.exec(text);
  let px;
  if (!call) {
    px = length(text);
  } else {
    const args = call[2].split(",").map(expr); // a nested "max(" fails as a LENGTH
    if (call[1] === "clamp") {
      if (args.length !== 3) throw new Error("clamp() takes exactly 3 arguments");
      const [min, val, max] = args;
      px = Math.max(min, Math.min(val, max));
    } else {
      px = call[1] === "min" ? Math.min(...args) : Math.max(...args);
    }
  }
  return Math.round(px * 100) / 100;
}
