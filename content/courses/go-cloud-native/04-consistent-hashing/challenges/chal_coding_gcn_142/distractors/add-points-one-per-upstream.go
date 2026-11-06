// @piece add-points: One point per virtual node, then keep the points sorted
p := hash(upstream)
r.points = append(r.points, p)
r.owner[p] = upstream
sort.Slice(r.points, func(a, b int) bool { return r.points[a] < r.points[b] })
