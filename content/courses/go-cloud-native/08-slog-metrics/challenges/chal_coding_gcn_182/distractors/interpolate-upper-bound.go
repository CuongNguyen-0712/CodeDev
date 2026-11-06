// @piece interpolate: Interpolate inside the bucket like histogram_quantile
if i >= len(h.Bounds) {
	return h.Bounds[len(h.Bounds)-1]
}
return h.Bounds[i]
