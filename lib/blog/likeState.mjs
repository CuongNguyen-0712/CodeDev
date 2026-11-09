/**
 * The like button's re-seed rule. `seen` is the last { liked, count } source values applied.
 * Each field follows its own source and only when that source changed, so a count the server
 * just answered is not overwritten by an unchanged (stale) count source. Nothing moves while pending.
 */
export function nextLikeState(state, seen, source, pending) {
    if (pending) return { state, seen };
    return {
        state: {
            liked: source.liked !== seen.liked ? source.liked : state.liked,
            count: source.count !== seen.count ? source.count : state.count,
        },
        seen: source,
    };
}
