// @piece wrap: Filter, escape and delimit the tool's text
const body = text.split(/\r?\n/).map((line) =>
    isInstructionLike(line) ? REMOVED : line.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"));
return [`<tool_result id="${callId}" tool="${spec.name}" trust="${spec.output}">`, ...body, "</tool_result>"].join("\n");
