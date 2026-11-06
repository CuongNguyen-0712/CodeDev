// @piece page-slice: The requested page of results
const page = query.page;
const start = (page - 1) * query.pageSize;
return { items: sorted.slice(start, start + query.pageSize), page, totalPages, total };
