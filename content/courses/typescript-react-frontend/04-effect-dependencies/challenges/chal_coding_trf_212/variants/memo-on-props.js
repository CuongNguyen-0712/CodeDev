// Wrong fix: useMemo keyed on the props OBJECT. The hook's own re-renders keep the same props object,
// so the loop stops, but the parent creates a new props object on every render: each parent re-render
// with equal values sends another request.
function useCatalogResults(props, { useState, useEffect, useMemo }, api) {
  const { search, level, sort, page } = props;
  const [results, setResults] = useState(null);

  const query = useMemo(() => ({ search, level, sort, page }), [props]);

  useEffect(() => {
    let ignore = false;
    api.fetchCourses(query).then((data) => {
      if (!ignore) setResults(data);
    });
    return () => { ignore = true; };
  }, [query]);

  return results;
}
