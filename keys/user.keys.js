export const userKeys = {
    all: ['user'],
    me: () => [...userKeys.all, 'me'],
    overview: () => [...userKeys.all, 'overview'],
    courseProgress: () => [...userKeys.all, 'courseProgress'],
    courseProgressList: (params) => [...userKeys.courseProgress(), params],
    learningProgress: (courseId) => [...userKeys.all, 'learningProgress', courseId],
    sessions: () => [...userKeys.all, 'sessions'],
    signInMethods: () => [...userKeys.all, 'signInMethods'],
    experience: () => [...userKeys.all, 'experience'],
    privacy: () => [...userKeys.all, 'privacy'],
    ranks: () => [...userKeys.all, 'ranks'],
    ranking: (board, period) => [...userKeys.all, 'ranking', board, period],
}