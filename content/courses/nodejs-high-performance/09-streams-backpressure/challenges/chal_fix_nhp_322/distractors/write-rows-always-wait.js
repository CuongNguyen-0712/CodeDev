// @piece write-rows: Write the header and every row
out.write("id,wallet_id,amount,created_at\n");
for await (const row of rows) {
  out.write(toCsvLine(row));
  await new Promise((resolve) => out.once("drain", resolve));
}
