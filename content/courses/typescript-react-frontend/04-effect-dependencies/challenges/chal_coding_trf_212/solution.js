/**
 * Reference solution (never shipped to learners).
 */
function useCatalogResults(props, { useState, useEffect }, api) {
  const { search, level, sort, page } = props;
  const [results, setResults] = useState(null);

  // depend on the primitive values: Object.is("beginner", "beginner") is true, so equal values skip the effect
  useEffect(() => {
    let ignore = false;
    api.fetchCourses({ search, level, sort, page }).then((data) => {
      if (!ignore) setResults(data); // a response for a filter we already left is dropped
    });
    return () => { ignore = true; };
  }, [search, level, sort, page]);

  return results;
}
