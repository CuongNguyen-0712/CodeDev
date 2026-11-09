export const blogKeys = {
    all: ['blog'],
    list: (tag) => [...blogKeys.all, 'list', tag ?? null],
}
