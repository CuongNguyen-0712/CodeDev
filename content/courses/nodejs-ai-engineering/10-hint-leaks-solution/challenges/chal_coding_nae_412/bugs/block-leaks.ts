// @piece block-leaks: Block a hint that shares too much code
// Never show the reference solution to the learner.
if (flatten(hint).includes(flatten(reference))) {
    return FALLBACK_HINT;
}
return hint;
