export const teamKeys = {
    all: ['teams'],
    members: (teamId) => [...teamKeys.all, 'members', teamId],
    invitations: () => [...teamKeys.all, 'invitations'],
}
