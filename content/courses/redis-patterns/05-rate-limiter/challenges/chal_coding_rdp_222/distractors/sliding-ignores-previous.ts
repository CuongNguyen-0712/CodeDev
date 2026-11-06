// @piece sliding-estimate: Estimate the requests of the sliding window
const W = windowSeconds * 1000;
const index = Math.floor(clock.now / W);
const elapsed = clock.now - index * W;
const currentKey = `rl:sliding:${key}:${index}`;
const curr = Number(redis.get(currentKey) ?? 0);
const prev = Number(redis.get(`rl:sliding:${key}:${index - 1}`) ?? 0);
const weighted = curr * W;
