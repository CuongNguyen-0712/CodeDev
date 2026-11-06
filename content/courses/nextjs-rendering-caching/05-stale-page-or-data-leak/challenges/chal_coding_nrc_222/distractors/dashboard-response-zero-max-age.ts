// @piece dashboard-response: Send the dashboard
return { status: 200, body: JSON.stringify(dashboard), cacheControl: "public, max-age=0, s-maxage=0" };
