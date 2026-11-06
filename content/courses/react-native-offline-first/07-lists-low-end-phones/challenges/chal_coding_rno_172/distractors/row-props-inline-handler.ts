// @piece row-props: Props for one row that stay equal between renders
rowProps: (item: Delivery) => ({ item, onOpen: () => openDelivery(item.id) }),
