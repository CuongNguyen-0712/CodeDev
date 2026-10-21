/**
 * Reference solution (never shipped to learners).
 */
function createInMemoryUserStore() {
  const rows = [];
  let nextId = 1;
  const copyOf = (row) => ({ id: row.id, email: row.email, name: row.name });
  const sameEmail = (a, b) => a.toLowerCase() === b.toLowerCase();

  return {
    async insert({ email, name }) {
      if (rows.some((row) => sameEmail(row.email, email))) {
        const error = new Error(`email already registered: ${email}`);
        error.code = "DUPLICATE_EMAIL";
        throw error;
      }
      const row = { id: nextId, email, name };
      nextId += 1;
      rows.push(row);
      return copyOf(row);
    },
    async findByEmail(email) {
      const row = rows.find((r) => sameEmail(r.email, email));
      return row ? copyOf(row) : null;
    },
    async list() {
      return rows.toSorted((a, b) => a.id - b.id).map(copyOf);
    },
  };
}
