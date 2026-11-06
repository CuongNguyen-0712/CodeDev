// @piece inline-spans: Turn code, links and bold into HTML
return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all: string, label: string, url: string) =>
        /^https?:\/\//i.test(url) ? `<a href="${url}" rel="noopener noreferrer">${label}</a>` : label);
