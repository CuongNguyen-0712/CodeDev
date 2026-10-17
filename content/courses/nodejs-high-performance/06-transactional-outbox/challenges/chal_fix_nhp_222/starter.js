/**
 * Consumes WalletCredited events from the message broker and credits the wallet.
 *
 * The broker (and the outbox relay in front of it) delivers AT LEAST ONCE: the same message can
 * arrive again after a consumer crash, a rebalance or a relay retry - even twice at the same time.
 * Each message must change the balance exactly once.
 *
 * Return "applied" when this delivery credited the wallet, "duplicate" when the message had
 * already been applied. Throw when something fails, so the broker redelivers the message.
 *
 * BUG: finance reports wallets credited twice for one top-up, and top-ups that never arrived
 * even though the consumer logged them as processed.
 *
 * @param {{
 *   transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>,   // commits when fn resolves, rolls back when it throws
 *   isProcessed(messageId: string): Promise<boolean>,          // autocommit versions of the Tx methods
 *   insertProcessed(messageId: string): Promise<boolean>,
 *   creditWallet(walletId: string, amount: number): Promise<void>,
 * }} db
 * @param {{ id: string, type: "WalletCredited", walletId: string, amount: number }} message
 * @returns {Promise<"applied" | "duplicate">}
 *
 * @typedef {object} Tx
 * @property {(messageId: string) => Promise<boolean>} isProcessed
 *   SELECT 1 FROM processed_messages WHERE message_id = $1
 * @property {(messageId: string) => Promise<boolean>} insertProcessed
 *   INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING
 *   -> true if this call inserted the row, false if the id already existed (message_id is the PRIMARY KEY)
 * @property {(walletId: string, amount: number) => Promise<void>} creditWallet
 *   UPDATE wallets SET balance = balance + $2 WHERE id = $1
 */
async function handleWalletCredited(db, message) {
  if (await db.isProcessed(message.id)) {
    return "duplicate";
  }

  await db.insertProcessed(message.id);
  await db.creditWallet(message.walletId, message.amount);
  return "applied";
}
