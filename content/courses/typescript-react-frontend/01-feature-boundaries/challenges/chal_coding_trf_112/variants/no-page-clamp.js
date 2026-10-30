// Wrong variant: trusts the page from the URL, so page 9 of 3 is an empty list labelled "page 9",
// and a search with no matches reports pageCount 0 ("Page 1 of 0").
function queryCatalog(courses, query) {
  const search = query.search.trim().toLowerCase();
  const list = courses.filter((course) =>
    (query.level === "all" || course.level === query.level) &&
    (course.title.toLowerCase().includes(search) || course.tags.some((tag) => tag.toLowerCase().includes(search))));
  const sorts = {
    popular: (a, b) => b.learners - a.learners,
    rating: (a, b) => b.rating - a.rating,
    newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    title: () => 0,
  };
  list.sort((a, b) => sorts[query.sort](a, b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: list.slice(start, start + query.pageSize),
    total: list.length,
    page: query.page,
    pageCount: Math.ceil(list.length / query.pageSize),
  };
}
