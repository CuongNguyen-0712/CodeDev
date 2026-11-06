// @piece record-store: Where records live and how a key is named
private readonly records = new Map<string, IdempotencyRecord>();

private id(userId: string, key: string): string {
    return key;
}
