export const userKeys = {
    all: ['user'],
    me: () => [...userKeys.all, 'me'],
    overview: () => [...userKeys.all, 'overview'],
    courseProgress: () => [...userKeys.all, 'courseProgress'],
    courseProgressList: (params) => [...userKeys.courseProgress(), params],
    learningProgress: (courseId) => [...userKeys.all, 'learningProgress', courseId],
}