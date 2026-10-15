export const challengeKeys = {
    all: ['challenge'],
    workspace: (challengeId) => [...challengeKeys.all, 'workspace', String(challengeId)],
}
