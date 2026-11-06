// @piece neutralise: Neutralise the content the model will read
// Normalise first: the model folds look-alikes such as "＜" into "<", so escape what it will read.
const normalisedText = input.content.normalize("NFKC");
const escaped = (normalisedText.match(/[<>]/g) ?? []).length;
const safe = normalisedText.split(`<<<END boundary=${boundary}>>>`).join(`&lt;&lt;&lt;END boundary=${boundary}&gt;&gt;&gt;`);
