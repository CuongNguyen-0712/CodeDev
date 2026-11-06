// @piece bucket-index: Pick the bucket: the first upper bound >= the value
i := sort.Search(len(h.Bounds), func(k int) bool { return h.Bounds[k] > v })
