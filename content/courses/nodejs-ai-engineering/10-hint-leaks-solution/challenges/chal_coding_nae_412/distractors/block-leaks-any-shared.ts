// @piece block-leaks: Block a hint that shares too much code
if (hint.trim() === "") return FALLBACK_HINT;
const fromReference = ngrams(tokens(reference));
if (fromReference.size === 0) return hint;
const fromHint = ngrams(tokens(hint));
let shared = 0;
for (const gram of fromReference) if (fromHint.has(gram)) shared++;
return shared > 0 ? FALLBACK_HINT : hint;
