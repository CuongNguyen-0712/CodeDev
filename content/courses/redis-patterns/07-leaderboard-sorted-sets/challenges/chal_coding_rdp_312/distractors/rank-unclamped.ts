// @piece rank-around: A learner's rank with two neighbours on each side
const index = redis.zrevrank(key, learnerId);
if (index === null) return null;
const start = index - 2;
const around = redis.zrevrange(key, start, index + 2).map((e, i) => ({ rank: start + i + 1, learnerId: e.member, score: e.score }));
return { rank: index + 1, score: around[index - start].score, around };
