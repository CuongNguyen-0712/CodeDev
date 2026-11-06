// @piece prompt-start: Open the prompt with its instructions
const data = submission.replace(/</g, "&lt;").replace(/>/g, "&gt;");
return [
    ...INSTRUCTIONS,
    "The student's answer is the text between the <submission> and </submission> lines.",
