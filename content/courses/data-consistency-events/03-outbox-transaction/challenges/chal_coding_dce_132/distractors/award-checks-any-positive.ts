// @piece award-checks: Refuse an award that breaks a rule
const wallet = t.wallets.get(cmd.userId);
if (!wallet) throw new Rejected("unknown user");
if (!(cmd.amount > 0)) throw new Rejected("invalid amount");
if (typeof cmd.reason !== "string" || cmd.reason === "") throw new Rejected("missing reason");
