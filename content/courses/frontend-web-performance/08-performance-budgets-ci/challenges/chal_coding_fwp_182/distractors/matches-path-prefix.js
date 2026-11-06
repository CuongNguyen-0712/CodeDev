// @piece matches-path: A budget's page pattern, * is one path segment
function matchesPath(pattern, url) {
    return url === pattern || (pattern.endsWith("*") && url.startsWith(pattern.slice(0, -1)));
}
