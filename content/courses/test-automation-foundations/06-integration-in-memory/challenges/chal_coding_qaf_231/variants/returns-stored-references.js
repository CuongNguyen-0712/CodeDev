// Wrong variant: ids, uniqueness and null are right, but it stores and returns the SAME objects - callers can change stored rows.
function createInMemoryUserStore() {
  const rows = [];
  return {
    async insert(user) {
      if (rows.some((row) => row.email.toLowerCase() === user.email.toLowerCase())) {
        throw Object.assign(new Error("email already registered"), { code: "DUPLICATE_EMAIL" });
      }
      user.id = rows.length + 1;
      rows.push(user);
      return user;
    },
    async findByEmail(email) {
      return rows.find((row) => row.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async list() {
      return rows;
    },
  };
}
