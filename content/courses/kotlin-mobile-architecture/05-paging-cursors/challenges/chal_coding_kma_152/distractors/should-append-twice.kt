// @piece should-append: Ask for the next page near the end, once
if (!endReached && lastVisible >= ids.size - prefetch) request(nextKey)
