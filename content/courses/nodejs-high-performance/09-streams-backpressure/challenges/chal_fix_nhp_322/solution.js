/**
 * Reference solution (never shipped to learners).
 * Respect write()'s return value: when it is false, wait for 'drain' before writing more.
 */
async function exportLedger(rows, out) {
  const write = async (chunk) => {
    if (!out.write(chunk)) {
      await new Promise((resolve) => out.once("drain", resolve));
    }
  };

  await write("id,wallet_id,amount,created_at\n");

  for await (const row of rows) {
    await write(toCsvLine(row));
  }

  out.end();
}

function toCsvLine(row) {
  return `${row.id},${row.walletId},${row.amount},${row.createdAt}\n`;
}
