// @piece inline-spans: Turn code, links and bold into HTML
let out = "";
let last = 0;
for (const m of text.matchAll(INLINE)) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) {
        out += `<code>${escapeHtml(m[1])}</code>`;
    } else if (m[2] !== undefined) {
        out += m[3].length > 0
            ? `<a href="${escapeHtml(m[3])}" rel="noopener noreferrer">${escapeHtml(m[2])}</a>`
            : escapeHtml(m[2]);
    } else {
        out += `<strong>${escapeHtml(m[4])}</strong>`;
    }
    last = m.index + m[0].length;
}
return out + escapeHtml(text.slice(last));
