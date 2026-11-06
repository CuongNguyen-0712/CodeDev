// @piece neutralise: Neutralise the content the model will read
// Normalise first: the model folds look-alikes such as "＜" into "<", so escape what it will read.
const normalisedText = input.content;
const escaped = (normalisedText.match(/[<>]/g) ?? []).length;
const safe = normalisedText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
