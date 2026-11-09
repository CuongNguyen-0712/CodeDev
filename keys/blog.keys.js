export const blogKeys = {
    all: ['blog'],
    list: (tag) => [...blogKeys.all, 'list', tag ?? null],
    mine: () => [...blogKeys.all, 'mine'],
    post: (id) => [...blogKeys.all, 'post', id],
    viewer: (id) => [...blogKeys.all, 'viewer', id],
    comments: (id) => [...blogKeys.all, 'comments', id],
    // No ids: the prefix of every page's feed state.
    feedState: (ids) => (ids ? [...blogKeys.all, 'feed-state', ids.join(',')] : [...blogKeys.all, 'feed-state']),
}
