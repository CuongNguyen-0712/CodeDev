// @piece match-rules: Does a course match the search and filters?
const search = query.search.toLowerCase();
return (
    (search === "" || course.title.toLowerCase().includes(search)) &&
    (query.category === "all" || course.category === query.category) &&
    (query.level === "all" || course.level === query.level)
);
