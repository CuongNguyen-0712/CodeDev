// @piece prompt: Build the prompt sent to the support model
const sources = docs.slice(0, Math.max(0, options.maxDocs));
return [
    "You are the CodeDev support assistant. Be friendly and answer the learner's question.",
    "",
    "Documentation:",
    ...sources.map((doc) => `[${doc.id}] ${doc.title}\n${doc.text}`),
    "",
    `Question: ${question}`,
].join("\n");
