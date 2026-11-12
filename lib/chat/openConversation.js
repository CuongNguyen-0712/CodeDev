// The conversation open in a visible tab. A plain ref, not a store: no component renders from it and it holds no server data.
let openId = null;

export const setOpenConversation = (id) => { openId = id; };
export const getOpenConversation = () => openId;
