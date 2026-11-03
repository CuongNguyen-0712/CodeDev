export const courseKeys = {
    all: ['course'],
    list: (params) => [...courseKeys.all, 'list', params],
    filters: () => [...courseKeys.all, 'filters'],
    details: (courseId) => [...courseKeys.all, 'details', courseId],
    // Under `details`, so every invalidation of a course page refreshes the viewer's part too.
    viewer: (courseId) => [...courseKeys.details(courseId), 'viewer'],
    register: () => [...courseKeys.all, 'register'],
    withdraw: () => [...courseKeys.all, 'withdraw'],
    learning: (lessonId) => [...courseKeys.all, 'learning', lessonId],
    comments: (courseId) => [...courseKeys.all, 'comments', courseId],
    rating: (courseId) => [...courseKeys.all, 'rating', courseId],
}