// Wrong variant: skips the filter when there is nothing to filter, then sorts that array in place,
// so with an empty search and level "all" it reorders the caller's courses array (the cached API data).
function queryCatalog(courses, query) {
  const search = query.search.trim().toLowerCase();
  const list = search === "" && query.level === "all"
    ? courses
    : courses.filter((course) =>
        (query.level === "all" || course.level === query.level) &&
        (course.title.toLowerCase().includes(search) || course.tags.some((tag) => tag.toLowerCase().includes(search))));
  const sorts = {
    popular: (a, b) => b.learners - a.learners,
    rating: (a, b) => b.rating - a.rating,
    newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    title: () => 0,
  };
  list.sort((a, b) => sorts[query.sort](a, b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(query.page, 1), pageCount);
  return { items: list.slice((page - 1) * query.pageSize, page * query.pageSize), total, page, pageCount };
}
