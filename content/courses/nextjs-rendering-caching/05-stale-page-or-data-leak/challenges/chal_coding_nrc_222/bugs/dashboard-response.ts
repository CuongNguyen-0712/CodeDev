// @piece dashboard-response: Send the dashboard
return { status: 200, body: JSON.stringify(dashboard), cacheControl: "public, s-maxage=60" };
