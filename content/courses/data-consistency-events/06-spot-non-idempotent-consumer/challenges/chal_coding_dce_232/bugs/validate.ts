// @piece validate: Refuse a message that cannot be applied
if (typeof userId !== "string" || userId === "" || !Number.isInteger(amount) || amount <= 0) {
    return "invalid";
}
