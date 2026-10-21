// Wrong variant: copies and errors are right, but emails are compared with ===, so "Ann@Shop.vn" and "ann@shop.vn" are two users.
function createInMemoryUserStore() {
  const rows = [];
  let nextId = 1;
  return {
    async insert({ email, name }) {
      if (rows.some((row) => row.email === email)) {
        throw Object.assign(new Error("email already registered"), { code: "DUPLICATE_EMAIL" });
      }
      const row = { id: nextId++, email, name };
      rows.push(row);
      return { ...row };
    },
    async findByEmail(email) {
      const row = rows.find((r) => r.email === email);
      return row ? { ...row } : null;
    },
    async list() {
      return rows.map((row) => ({ ...row }));
    },
  };
}
