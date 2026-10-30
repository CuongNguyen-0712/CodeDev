// Wrong fix: "run it only once" with an empty dependency array. The loop is gone, but a change of
// search, level, sort or page never fetches again: the list stays on the first filter.
function useCatalogResults(props, { useState, useEffect }, api) {
  const { search, level, sort, page } = props;
  const [results, setResults] = useState(null);

  useEffect(() => {
    let ignore = false;
    api.fetchCourses({ search, level, sort, page }).then((data) => {
      if (!ignore) setResults(data);
    });
    return () => { ignore = true; };
  }, []);

  return results;
}
