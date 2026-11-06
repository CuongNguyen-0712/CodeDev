// @piece plain-rejections: Rejections that need no header
case "validation_failed":
    return plain(422);
case "rule_violated":
    return plain(422);
case "forbidden":
    return plain(403);
case "not_found":
    return plain(404);
case "version_conflict":
    return plain(409);
case "payment_required":
    return plain(402);
case "gone":
    return plain(410);
