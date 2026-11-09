export const blogKeys = {
    all: ['blog'],
    list: (tag) => [...blogKeys.all, 'list', tag ?? null],
    mine: () => [...blogKeys.all, 'mine'],
    post: (id) => [...blogKeys.all, 'post', id],
    viewer: (id) => [...blogKeys.all, 'viewer', id],
    liked: (ids) => [...blogKeys.all, 'liked', ids.join(',')],
}
