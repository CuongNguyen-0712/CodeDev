// @piece prompt: Build the prompt sent to the support model
return [
    "You are the CodeDev support assistant. Be friendly and answer the learner's question.",
    "",
    `Question: ${question}`,
].join("\n");
