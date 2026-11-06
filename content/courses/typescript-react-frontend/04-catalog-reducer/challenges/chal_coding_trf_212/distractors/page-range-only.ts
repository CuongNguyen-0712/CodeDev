// @piece page: Page changed
const page = action.page;
if (page < 1 || page > state.totalPages || page === state.page) return state;
return { ...state, page };
