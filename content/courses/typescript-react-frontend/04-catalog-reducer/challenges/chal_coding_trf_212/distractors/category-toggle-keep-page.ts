// @piece category-toggle: Category toggled on or off
const category = action.category;
if (!isOneOf(CATEGORIES, category)) return state;
const categories = state.categories.includes(category)
    ? state.categories.filter((c) => c !== category)
    : [...state.categories, category];
return { ...state, categories };
