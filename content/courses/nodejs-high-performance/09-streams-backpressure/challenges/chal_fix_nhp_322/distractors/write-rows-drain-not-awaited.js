// @piece write-rows: Write the header and every row
out.write("id,wallet_id,amount,created_at\n");
for await (const row of rows) {
  if (!out.write(toCsvLine(row))) {
    out.once("drain", () => {});
  }
}
