// @piece success-outcomes: Outcomes that succeeded (2xx)
case "ok":
    return plain(m === "DELETE" ? 204 : 200);
case "created":
    return hasLocation ? { status: 201, headers: { Location: outcome.location! } } : plain(500);
case "accepted":
    return hasLocation ? { status: 202, headers: { Location: outcome.location! } } : plain(500);
case "already_exists":
    return plain(200);
