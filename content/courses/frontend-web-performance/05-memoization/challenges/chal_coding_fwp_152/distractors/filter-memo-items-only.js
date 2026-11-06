// @piece filter-memo: Filter again only when the dishes or the query change
const visible = useMemo(() => filterMenu(items, query), [items]);
