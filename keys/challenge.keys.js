export const challengeKeys = {
    all: ['challenge'],
    workspace: (challengeId) => [...challengeKeys.all, 'workspace', String(challengeId)],
    quizState: (challengeId) => [...challengeKeys.all, 'quiz', String(challengeId)],
}
