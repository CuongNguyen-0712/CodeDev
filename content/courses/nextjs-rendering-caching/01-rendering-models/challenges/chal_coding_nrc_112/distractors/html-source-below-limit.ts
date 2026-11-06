// @piece html-source: Rule 5: where the HTML comes from
const where = page.dataAtBuild && page.pageCount < MAX_BUILD_PAGES ? "prerendered at build" : "rendered on first request";
