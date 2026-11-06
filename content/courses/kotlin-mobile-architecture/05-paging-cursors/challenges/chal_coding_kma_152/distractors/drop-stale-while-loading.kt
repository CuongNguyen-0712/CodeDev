// @piece drop-stale: Pages requested before the last refresh change nothing
if (req.gen != generation && !loading) return
