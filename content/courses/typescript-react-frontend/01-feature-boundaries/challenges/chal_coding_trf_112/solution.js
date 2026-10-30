/**
 * Reference solution (never shipped to learners).
 */
function queryCatalog(courses, query) {
  const search = query.search.trim().toLowerCase();
  const matches = courses.filter((course) => {
    if (query.level !== "all" && course.level !== query.level) return false;
    if (search === "") return true;
    return course.title.toLowerCase().includes(search) ||
      course.tags.some((tag) => tag.toLowerCase().includes(search));
  });

  const primary = SORTS[query.sort];
  if (!primary) throw new Error(`Unknown sort: ${query.sort}`);
  // filter() already returned a new array, so sorting it never touches the caller's array
  matches.sort((a, b) => primary(a, b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(query.page, 1), pageCount);
  const start = (page - 1) * query.pageSize;
  return { items: matches.slice(start, start + query.pageSize), total, page, pageCount };
}

const SORTS = {
  popular: (a, b) => b.learners - a.learners,
  rating: (a, b) => b.rating - a.rating,
  newest: (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
  title: () => 0,
};
