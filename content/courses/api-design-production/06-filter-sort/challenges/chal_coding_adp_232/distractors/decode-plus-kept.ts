// @piece decode-value: Decode a percent-encoded name or value
function decode(raw: string): string | null {
    try {
        return decodeURIComponent(raw);
    } catch {
        return null;
    }
}
