// @piece claim-token: Take the token before rotating it
// Rotate: retire the family's live token, then issue the successor.
await db.retireLiveTokens(row.familyId, req.now);
