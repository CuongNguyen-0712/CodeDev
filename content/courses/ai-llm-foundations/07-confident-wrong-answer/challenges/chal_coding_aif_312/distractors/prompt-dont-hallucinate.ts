// @piece prompt: Build the prompt sent to the support model
return [
    "You are the CodeDev support assistant. Do not hallucinate and only give correct answers.",
    "If you do not know the answer, reply: I'm not sure.",
    "",
    `Question: ${question}`,
].join("\n");
