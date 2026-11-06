// @piece dashboard-cache: Cache the dashboard query
return cached("dashboard", 60, () => db.dashboardFor(userId));
