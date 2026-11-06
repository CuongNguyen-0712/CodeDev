// @piece refresh: Refresh the list every 30 seconds
const latest = useRef(filter);
useEffect(() => {
    const id = timers.setInterval(() => {
        api.fetchCourses(latest.current).then(setCourses);
    }, 30_000);
    return () => timers.clearInterval(id);
}, []);
