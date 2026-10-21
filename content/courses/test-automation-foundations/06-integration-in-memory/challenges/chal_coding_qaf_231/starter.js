/**
 * Build an in-memory user store that keeps the same contract as the real Postgres store,
 * so integration tests that use it tell the truth.
 *
 * createInMemoryUserStore() returns a NEW, empty store each time it is called (two stores never
 * share data). The store has three async methods - each returns a promise, like the real one:
 *
 *   insert({ email, name })
 *     - Stores a new user and resolves to { id, email, name }.
 *     - ids are numbers assigned in insert order: the first user gets 1, the next 2, and so on.
 *     - Emails are unique IGNORING CASE: if a stored user already has the same email in any case
 *       ("Ann@Shop.vn" vs "ann@shop.vn"), nothing is stored and the promise rejects with an Error
 *       whose `code` property is "DUPLICATE_EMAIL" (the real store translates Postgres' unique
 *       violation into exactly this error).
 *     - The email and name are stored exactly as given.
 *
 *   findByEmail(email)
 *     - Resolves to the user { id, email, name } whose email matches ignoring case,
 *       or to null (not undefined) when there is none.
 *
 *   list()
 *     - Resolves to an array of every user, sorted by id (ascending).
 *
 * No shared references, in either direction: the store keeps its own copy of what it is given,
 * and every object it returns is a fresh copy. Changing an object you passed to insert(), or any
 * object or array the store returned, must never change what the store holds.
 *
 * Example:
 *   const users = createInMemoryUserStore();
 *   await users.insert({ email: "Ann@Shop.vn", name: "Ann" });   // { id: 1, email: "Ann@Shop.vn", name: "Ann" }
 *   await users.findByEmail("ann@shop.vn");                      // { id: 1, email: "Ann@Shop.vn", name: "Ann" }
 *   await users.findByEmail("bob@shop.vn");                      // null
 *   await users.insert({ email: "ANN@SHOP.VN", name: "Ann 2" }); // rejects: Error, err.code === "DUPLICATE_EMAIL"
 *
 * The grader runs a contract suite against your store, then wires it to the shop's (correct)
 * signup service and handleSignup(req) handler and checks the 201, 409 and 400 responses.
 *
 * @returns {{ insert: Function, findByEmail: Function, list: Function }}
 */
function createInMemoryUserStore() {
  const rows = [];

  // The quick fake from the incident: it agrees with the code, not with the database.
  return {
    async insert(user) {
      user.id = rows.length + 1;
      rows.push(user);
      return user;
    },
    async findByEmail(email) {
      return rows.find((row) => row.email === email);
    },
    async list() {
      return rows;
    },
  };
}
