// @piece field-errors: Check every field and report all problems at once (422)
invalid := func(field, detail string) (int, *Problem, *Order) {
	p := problem(422, "invalid-order", "Invalid order", "1 field(s) are invalid")
	p.Errors = []FieldError{{field, detail}}
	return 422, p, nil
}
if o.RestaurantID == "" {
	return invalid("restaurantId", "is required")
}
if len(o.Items) == 0 {
	return invalid("items", "needs at least one item")
}
for i, it := range o.Items {
	if it.Quantity < 1 || it.Quantity > 20 {
		return invalid(fmt.Sprintf("items[%d].quantity", i), "must be between 1 and 20")
	}
}
if strings.TrimSpace(o.DeliveryAddress) == "" {
	return invalid("deliveryAddress", "is required")
}
