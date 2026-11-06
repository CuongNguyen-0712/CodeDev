// @piece plan: The plan: what is sent, dropped and counted
return {
    sent: [system.id, ...history.slice(first).map((m) => m.id).reverse()],
    dropped: history.slice(0, first).map((m) => m.id),
    inputTokens: total,
};
