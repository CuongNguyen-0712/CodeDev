// @piece award-write: Add the points and their events
const before = Math.floor(wallet.points / 1000);
wallet.points += cmd.amount;
addEvent(t, ids, clock, "wallet", wallet.userId, "points.awarded", {
    userId: wallet.userId,
    amount: cmd.amount,
    reason: cmd.reason,
    balance: wallet.points,
});
const level = Math.floor(wallet.points / 1000);
if (level > before) addEvent(t, ids, clock, "wallet", wallet.userId, "level.reached", { userId: wallet.userId, level });
