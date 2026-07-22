export const courseKeys = {
    all: ['course'],
    list: (params) => [...courseKeys.all, 'list', params],
    details: (courseId) => [...courseKeys.all, 'details', courseId],
    register: () => [...courseKeys.all, 'register'],
    withdraw: () => [...courseKeys.all, 'withdraw'],
    learning: (lessonId) => [...courseKeys.all, 'learning', lessonId],
}