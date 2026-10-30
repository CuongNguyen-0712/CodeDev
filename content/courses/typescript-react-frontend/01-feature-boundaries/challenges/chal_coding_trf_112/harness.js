// Harness: calls the learner's queryCatalog(courses, query) once.
// Output: { ids, total, page, pageCount } where ids are the ids of the returned items, in order.
// With input.checkInput, it also reports whether the courses array (order and contents) is unchanged.
async function __harness(input) {
  const before = JSON.stringify(input.courses);
  const result = queryCatalog(input.courses, input.query);
  const output = {
    ids: result.items.map((course) => course.id),
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
  };
  if (input.checkInput) output.inputUnchanged = JSON.stringify(input.courses) === before;
  return output;
}
