// @piece decode-validate: Accept only a cursor this API could have made
const { o, k } = raw as { v?: unknown; o?: unknown; k?: unknown };
if (!Array.isArray(k)) return null;
return { v: 1, o: o as Order, k: k as [string, number] };
