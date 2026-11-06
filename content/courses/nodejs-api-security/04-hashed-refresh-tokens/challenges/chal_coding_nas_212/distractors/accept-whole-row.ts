// @piece accept: Accept: log and return the session
deps.log({ event: "refresh_token.accepted", id: row.id });
return { ok: true, ...row };
