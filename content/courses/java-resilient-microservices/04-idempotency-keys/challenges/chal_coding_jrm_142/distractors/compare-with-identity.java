// @piece same-key-other-request: Refuse a key reused for a different request
if (kept.fingerprint() != fingerprint) {
    return Decision.answer(422, "key reused");
}
