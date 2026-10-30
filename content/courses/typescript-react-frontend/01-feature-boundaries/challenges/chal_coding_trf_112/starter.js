/**
 * Search, filter, sort and paginate the CodeDev course catalog - the pure logic behind /courses.
 *
 * courses: Course[]   { id, title, level, tags, rating, learners, updatedAt }
 * query:   { search, level, sort, page, pageSize }
 *
 * 1. search  trim it and compare case-insensitively; a course matches when its title or
 *            at least one of its tags contains the search text. Empty search matches all.
 * 2. level   "all" keeps every course, otherwise keep courses whose level is exactly equal.
 * 3. sort    "popular" learners desc, "rating" rating desc, "newest" updatedAt desc,
 *            "title" title asc (localeCompare). Ties: title asc (localeCompare), then id asc (localeCompare).
 * 4. page    1-based. pageCount = max(1, ceil(total / pageSize)); clamp page into 1..pageCount.
 *
 * Returns { items, total, page, pageCount } where total counts the matches before paging.
 * Do not change the courses array or the course objects you receive.
 *
 * @param {Array<object>} courses
 * @param {{ search: string, level: string, sort: string, page: number, pageSize: number }} query
 * @returns {{ items: Array<object>, total: number, page: number, pageCount: number }}
 */
function queryCatalog(courses, query) {
  // TODO: filter, sort, then cut out the requested page.
  const items = courses.filter((course) => course.title.includes(query.search));
  return { items: items.slice(0, query.pageSize), total: items.length, page: query.page, pageCount: 1 };
}
