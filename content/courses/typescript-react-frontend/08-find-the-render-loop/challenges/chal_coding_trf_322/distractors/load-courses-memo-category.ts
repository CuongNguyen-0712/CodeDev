// @piece load-courses: Load the courses for this category and page
const query = useMemo<Query>(() => ({ category, page }), [category]);

useEffect(() => {
    setLoading(true);
    api.fetchCourses(query).then((result) => {
        setCourses(result);
        setLoading(false);
    });
}, [query]);
