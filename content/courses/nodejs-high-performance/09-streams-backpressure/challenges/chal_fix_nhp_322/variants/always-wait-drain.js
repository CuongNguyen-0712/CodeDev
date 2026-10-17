// Wrong variant: waits for 'drain' after EVERY write -> 'drain' only fires after write() returned false, so the export hangs.
async function exportLedger(rows, out) {
  out.write("id,wallet_id,amount,created_at\n");
  for await (const row of rows) {
    out.write(toCsvLine(row));
    await new Promise((resolve) => out.once("drain", resolve));
  }
  out.end();
}

function toCsvLine(row) {
  return `${row.id},${row.walletId},${row.amount},${row.createdAt}\n`;
}
