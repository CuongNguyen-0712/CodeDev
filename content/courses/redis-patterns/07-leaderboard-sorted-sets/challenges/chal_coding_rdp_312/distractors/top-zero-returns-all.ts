// @piece top-n: The first n entries, highest score first
return redis.zrevrange(key, 0, n - 1).map((e, i) => ({ rank: i + 1, learnerId: e.member, score: e.score }));
