// @piece walk-clockwise: Walk clockwise past upstreams that are down, wrapping around
for n := i; n < len(r.points); n++ {
	if u := r.owner[r.points[n]]; !down[u] {
		return u
	}
}
return ""
