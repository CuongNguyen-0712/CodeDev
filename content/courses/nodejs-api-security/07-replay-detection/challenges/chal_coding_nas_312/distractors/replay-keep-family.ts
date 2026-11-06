// @piece replay: Anything else is a replay
store.recordEvent({ type: "refresh_token_reuse", userId: row.userId, familyId: row.familyId, tokenId: row.id, deviceId: req.deviceId, at: req.now });
return { status: "replay_detected" };
