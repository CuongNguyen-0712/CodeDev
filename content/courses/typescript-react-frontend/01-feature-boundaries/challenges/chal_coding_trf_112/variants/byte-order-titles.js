// Wrong variant: compares titles with < instead of localeCompare and has no id tie-break,
// so "SQL & Data Modeling" sorts before "Software Architecture Fundamentals" (uppercase Q < lowercase o)
// and two courses with the same title keep whatever order the API sent.
function queryCatalog(courses, query) {
  const search = query.search.trim().toLowerCase();
  const list = courses.filter((course) =>
    (query.level === "all" || course.level === query.level) &&
    (course.title.toLowerCase().includes(search) || course.tags.some((tag) => tag.toLowerCase().includes(search))));
  const byTitle = (a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  const sorts = {
    popular: (a, b) => b.learners - a.learners,
    rating: (a, b) => b.rating - a.rating,
    newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    title: () => 0,
  };
  list.sort((a, b) => sorts[query.sort](a, b) || byTitle(a, b));
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(query.page, 1), pageCount);
  return { items: list.slice((page - 1) * query.pageSize, page * query.pageSize), total, page, pageCount };
}
