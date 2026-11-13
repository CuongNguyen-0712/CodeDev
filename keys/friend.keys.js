export const friendKeys = {
    all: ['friends'],
    list: (search) => [...friendKeys.all, 'list', search],
    invitations: (direction) => [...friendKeys.all, 'invitations', direction],
    counts: () => [...friendKeys.all, 'counts'],
}
