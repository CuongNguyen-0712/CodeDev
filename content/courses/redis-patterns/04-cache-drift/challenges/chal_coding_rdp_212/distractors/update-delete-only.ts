// @piece after-update: After the price is saved
if (row === null) return false;
// Invalidate: drop the copy.
for (const key of [`course:${id}`, `courses:category:${row.category}`]) {
    this.redis.del(key);
}
return true;
