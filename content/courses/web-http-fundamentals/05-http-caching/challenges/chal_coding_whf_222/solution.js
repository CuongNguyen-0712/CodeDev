/**
 * Reference solution (never shipped to learners).
 */
function parseCacheControl(header) {
  const result = { maxAge: null, noStore: false, noCache: false, private: false, public: false };
  if (typeof header !== "string") return result;
  let seenMaxAge = false;
  for (const item of splitOutsideQuotes(header)) {
    const directive = item.trim();
    if (directive === "") continue;
    const eq = directive.indexOf("=");
    const name = (eq === -1 ? directive : directive.slice(0, eq)).trim().toLowerCase();
    const value = eq === -1 ? null : unquote(directive.slice(eq + 1).trim());
    if (name === "max-age" && !seenMaxAge) {
      seenMaxAge = true; // RFC 9111: with duplicates, use the first one
      result.maxAge = value !== null && /^\d+$/.test(value) ? Math.min(Number(value), 2147483648) : null;
    } else if (name === "no-store") result.noStore = true;
    else if (name === "no-cache") result.noCache = true;
    else if (name === "private") result.private = true;
    else if (name === "public") result.public = true;
  }
  return result;
}

// Split at commas that are not inside a quoted string (backslash escapes a character inside quotes).
function splitOutsideQuotes(text) {
  const items = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === "\\" && i + 1 < text.length) {
      current += ch + text[++i];
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items;
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return value;
}
