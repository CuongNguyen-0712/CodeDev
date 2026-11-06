// @piece refresh: Refresh the list every 30 seconds
useEffect(() => {
    const id = timers.setInterval(() => {
        api.fetchCourses(filter).then(setCourses);
    }, 30_000);
    return () => timers.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
