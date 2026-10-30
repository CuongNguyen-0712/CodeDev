// Partial fix: the dependencies are right, so the loop is gone, but there is no cleanup. When the
// response for the previous level arrives after the response for the new level, it overwrites it.
function useCatalogResults(props, { useState, useEffect }, api) {
  const { search, level, sort, page } = props;
  const [results, setResults] = useState(null);

  useEffect(() => {
    api.fetchCourses({ search, level, sort, page }).then(setResults);
  }, [search, level, sort, page]);

  return results;
}
