// @piece keep-history: Keep older messages while they still fit
// first = index of the oldest message kept; walk back while the next older message still fits
let first = history.length - 1;
while (first > 0 && total + history[first - 1].tokens < budget) {
    first--;
    total += history[first].tokens;
}
