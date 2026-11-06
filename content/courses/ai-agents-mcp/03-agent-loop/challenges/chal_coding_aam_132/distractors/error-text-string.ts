// @piece error-text: Turn any thrown value into a message
if (thrown instanceof Error) return thrown.message;
return String(thrown);
