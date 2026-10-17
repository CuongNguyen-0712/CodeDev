// Wrong variant: notices write() returned false but does not WAIT for 'drain' -> the buffer still grows without bound.
async function exportLedger(rows, out) {
  out.write("id,wallet_id,amount,created_at\n");
  for await (const row of rows) {
    if (!out.write(toCsvLine(row))) {
      out.once("drain", () => {});
    }
  }
  out.end();
}

function toCsvLine(row) {
  return `${row.id},${row.walletId},${row.amount},${row.createdAt}\n`;
}
