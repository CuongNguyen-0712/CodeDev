// @piece success-states: Loaded: an empty result or the list
const courses = snapshot.data ?? [];
if (snapshot.isFetching) return { kind: "loading" };
if (courses.length === 0) return { kind: "empty", query: snapshot.query.trim() };
return { kind: "success", courses, refreshing: false };
