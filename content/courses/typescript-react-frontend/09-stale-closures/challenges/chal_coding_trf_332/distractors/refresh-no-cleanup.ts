// @piece refresh: Refresh the list every 30 seconds
useEffect(() => {
    timers.setInterval(() => {
        api.fetchCourses(filter).then(setCourses);
    }, 30_000);
}, [filter]);
