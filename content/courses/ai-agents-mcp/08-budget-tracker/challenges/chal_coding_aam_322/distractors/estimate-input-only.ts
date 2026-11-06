// @piece estimate: Price the call at its worst case before sending it
const price = this.config.prices[model];
if (!price) return "unknown_model";
const { session, maxOutputTokens } = this.config;
const tokens = inputTokens;
const cost = inputTokens * price.inputPerMTok;
