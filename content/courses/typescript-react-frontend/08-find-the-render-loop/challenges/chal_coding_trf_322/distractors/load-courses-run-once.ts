// @piece load-courses: Load the courses for this category and page
const query: Query = { category, page };

useEffect(() => {
    setLoading(true);
    api.fetchCourses(query).then((result) => {
        setCourses(result);
        setLoading(false);
    });
}, []);
