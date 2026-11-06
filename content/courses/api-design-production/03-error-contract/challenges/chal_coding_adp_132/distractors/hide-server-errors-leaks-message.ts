// @piece hide-server-errors: What a 5xx may reveal
if (status >= 500 && thrown instanceof Error) message = thrown.message;
else if (status >= 500) {
    message = "server.error";
    details = [];
}
