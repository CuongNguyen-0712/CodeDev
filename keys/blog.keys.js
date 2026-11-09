export const blogKeys = {
    all: ['blog'],
    list: (tag) => [...blogKeys.all, 'list', tag ?? null],
    mine: () => [...blogKeys.all, 'mine'],
    post: (id) => [...blogKeys.all, 'post', id],
}
