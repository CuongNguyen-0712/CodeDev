export const roadmapKeys = {
    all: ['roadmap'],
    list: () => [...roadmapKeys.all, 'list'],
    details: (id) => [...roadmapKeys.all, 'details', id],
}