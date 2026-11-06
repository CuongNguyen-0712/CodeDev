// @piece stable-add: One add handler that follows the current addToCart
const onAdd = useCallback((id) => addToCart(id), []);
