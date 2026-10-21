/**
 * Reference solution (never shipped to learners).
 */
function cascadeWinner(layerOrder, declarations) {
  let best = 0;
  let bestKey = sortKey(layerOrder, declarations[0], 0);
  for (let i = 1; i < declarations.length; i++) {
    const key = sortKey(layerOrder, declarations[i], i);
    if (compareKeys(key, bestKey) > 0) {
      best = i;
      bestKey = key;
    }
  }
  const winner = declarations[best];
  return { index: best, value: winner.value, specificity: winner.inline ? null : specificity(winner.selector) };
}

// [importance, inline, layer rank, A, B, C, order]: larger wins, compared left to right.
function sortKey(layerOrder, d, index) {
  const rank = d.layer == null ? layerOrder.length : layerOrder.indexOf(d.layer);
  const spec = d.inline ? [0, 0, 0] : specificity(d.selector);
  return [d.important ? 1 : 0, d.inline ? 1 : 0, d.important ? -rank : rank, ...spec, index];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function specificity(selector) {
  const spec = [0, 0, 0];
  const name = /^[\w-]*/;
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === "#") {
      spec[0]++;
      i += 1 + name.exec(selector.slice(i + 1))[0].length;
    } else if (ch === ".") {
      spec[1]++;
      i += 1 + name.exec(selector.slice(i + 1))[0].length;
    } else if (ch === "[") {
      spec[1]++;
      i = selector.indexOf("]", i) + 1;
    } else if (selector.startsWith("::", i)) {
      spec[2]++;
      i += 2 + name.exec(selector.slice(i + 2))[0].length;
    } else if (ch === ":") {
      const pseudo = name.exec(selector.slice(i + 1))[0];
      i += 1 + pseudo.length;
      let arg = null;
      if (selector[i] === "(") {
        const close = selector.indexOf(")", i);
        arg = selector.slice(i + 1, close);
        i = close + 1;
      }
      if (pseudo === "where") continue;
      if (pseudo === "is" || pseudo === "not" || pseudo === "has") {
        const largest = arg.split(",").map((s) => specificity(s.trim())).reduce((x, y) => (compareKeys(x, y) >= 0 ? x : y));
        for (let k = 0; k < 3; k++) spec[k] += largest[k];
      } else {
        spec[1]++;
      }
    } else if (/[A-Za-z]/.test(ch)) {
      spec[2]++;
      i += name.exec(selector.slice(i))[0].length;
    } else {
      i++; // "*", whitespace and combinators add nothing
    }
  }
  return spec;
}
