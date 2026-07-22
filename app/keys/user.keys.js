export const userKeys = {
    all: ['user'],
    me: () => [...userKeys.all, 'me'],
    courseProgress: () => [...userKeys.all, 'courseProgress'],
    courseProgressList: (params) => [...userKeys.courseProgress(), params],
    learningProgress: (courseId) => [...userKeys.all, 'learningProgress', courseId],
}