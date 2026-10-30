/**
 * Results for the CodeDev catalog screen (/courses).
 *
 * This is a React hook written against injected hooks so it can run in a small simulator:
 *   props  { search: string, level: "all" | "beginner" | "intermediate" | "advanced",
 *            sort: "popular" | "rating" | "newest" | "title", page: number }
 *          The parent (CatalogPage) passes a new props object every time it renders, even when
 *          the values did not change.
 *   hooks  { useState, useEffect, useMemo, useCallback, useRef } - they behave like React's.
 *   api    { fetchCourses(query) } - GET /api/courses; returns a Promise of { items, total }.
 *          Responses can arrive in a different order than the requests were sent.
 *
 * Returns the response for the CURRENT filter, or null before the first response arrives.
 * Expected behavior: one request on mount, one more request for every real change of search,
 * level, sort or page, no request when the parent re-renders with the same values, and a slow
 * response for a filter the learner already left must never replace the newer results.
 *
 * Reported bug (after the "group the filters into one query object" refactor): the Network panel
 * shows GET /api/courses for the same filter dozens of times per second while the page is open,
 * and sometimes the list shows the courses of the level the learner just switched away from.
 */
function useCatalogResults(props, { useState, useEffect }, api) {
  const { search, level, sort, page } = props;
  const [results, setResults] = useState(null);

  const query = { search, level, sort, page };

  useEffect(() => {
    api.fetchCourses(query).then(setResults);
  }, [query]);

  return results;
}
