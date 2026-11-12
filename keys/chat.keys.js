export const chatKeys = {
    all: ['chat'],
    inbox: (tab) => [...chatKeys.all, 'inbox', tab],
    conversation: (id) => [...chatKeys.all, 'conversation', id],
    messages: (id) => [...chatKeys.all, 'messages', id],
    unread: () => [...chatKeys.all, 'unread'],
    blocks: () => [...chatKeys.all, 'blocks'],
}
