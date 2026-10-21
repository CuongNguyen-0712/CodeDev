/**
 * Compares the permissions of a role before and after an edit, for the audit log.
 *
 * `before` and `after` are arrays of permission strings such as "orders:read". They may
 * contain duplicates. Return three lists (arrays or Sets), each without duplicates:
 *   - granted:   in `after` but not in `before`
 *   - revoked:   in `before` but not in `after`
 *   - unchanged: in both
 * The order inside each list does not matter.
 *
 * Use the ES2025 Set methods (difference, intersection, ...) instead of nested includes() loops.
 *
 * @param {string[]} before
 * @param {string[]} after
 * @returns {{ granted: Iterable<string>, revoked: Iterable<string>, unchanged: Iterable<string> }}
 */
function diffPermissions(before, after) {
  // TODO: turn both arrays into Sets and compare them with Set methods
  return { granted: [], revoked: [], unchanged: [] };
}

/**
 * Returns an array with the first `n` users for which isMatch(user) is true, in source order.
 *
 * `users` is an iterator (for example a generator) that may hold millions of users.
 * Requirements:
 *   - never pull a user from `users` after the n-th match has been found
 *   - when you stop early, the source must be closed (its finally block must run)
 *   - if the source runs out first, return the matches that exist
 *   - n is a positive integer
 *
 * Iterator helpers (Iterator.from, filter, take, toArray) do all of this for you.
 *
 * @template T
 * @param {Iterator<T> | Iterable<T>} users
 * @param {(user: T) => boolean} isMatch
 * @param {number} n
 * @returns {T[]}
 */
function firstMatching(users, isMatch, n) {
  // TODO: filter lazily and stop after n matches
  return [];
}
