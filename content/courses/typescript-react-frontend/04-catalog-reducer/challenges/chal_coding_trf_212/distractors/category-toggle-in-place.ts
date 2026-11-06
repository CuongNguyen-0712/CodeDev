// @piece category-toggle: Category toggled on or off
const category = action.category;
if (!isOneOf(CATEGORIES, category)) return state;
const categories = state.categories;
const index = categories.indexOf(category);
if (index >= 0) categories.splice(index, 1);
else categories.push(category);
return { ...state, categories, page: 1 };
