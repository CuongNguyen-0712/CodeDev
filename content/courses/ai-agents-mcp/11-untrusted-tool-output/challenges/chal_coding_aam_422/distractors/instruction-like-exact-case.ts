// @piece instruction-like: Does a line read like an instruction to the model
const t = line.trim();
return /^(INSTRUCTION|system|assistant|developer):/.test(t) || t.includes("ignore previous");
