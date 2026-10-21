// Wrong variant: rejects duplicates with a plain Error that has no code, so the signup service cannot map it to 409 and answers 500.
function createInMemoryUserStore() {
  const rows = [];
  let nextId = 1;
  return {
    async insert({ email, name }) {
      if (rows.some((row) => row.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("duplicate key value violates unique constraint \"users_email_lower_key\"");
      }
      const row = { id: nextId++, email, name };
      rows.push(row);
      return { ...row };
    },
    async findByEmail(email) {
      const row = rows.find((r) => r.email.toLowerCase() === email.toLowerCase());
      return row ? { ...row } : null;
    },
    async list() {
      return rows.map((row) => ({ ...row }));
    },
  };
}
