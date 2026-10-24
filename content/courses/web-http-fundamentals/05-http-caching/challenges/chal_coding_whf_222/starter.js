/**
 * Read one Cache-Control header value, as an HTTP cache would (RFC 9111).
 *
 * Returns exactly { maxAge, noStore, noCache, private, public }:
 *   - maxAge   integer seconds from max-age, or null when it is missing or not a plain
 *              non-negative integer ("-1", "1.5", "60s", "abc", "", no value).
 *              A quoted value counts: max-age="120" -> 120.
 *              Values above 2147483648 are capped at 2147483648.
 *   - noStore, noCache, private, public
 *              true when the directive is present (with or without an argument:
 *              no-cache="Set-Cookie" still counts as no-cache), false otherwise.
 *
 * Header rules:
 *   - directives are separated by commas, with optional spaces around them
 *   - directive names are case-insensitive: "Max-Age=60", "NO-STORE"
 *   - a value may be a quoted string that contains commas:
 *       private="Set-Cookie, Authorization"   is ONE directive
 *   - empty items and unknown directives (immutable, s-maxage=600, ...) are ignored;
 *     s-maxage never sets maxAge
 *   - null, undefined or "" -> { maxAge: null, noStore: false, noCache: false, private: false, public: false }
 *
 * Examples:
 *   parseCacheControl("public, max-age=86400")
 *     -> { maxAge: 86400, noStore: false, noCache: false, private: false, public: true }
 *   parseCacheControl("private, no-cache")
 *     -> { maxAge: null, noStore: false, noCache: true, private: true, public: false }
 *
 * @param {string | null | undefined} header
 * @returns {{ maxAge: number | null, noStore: boolean, noCache: boolean, private: boolean, public: boolean }}
 */
function parseCacheControl(header) {
  const result = { maxAge: null, noStore: false, noCache: false, private: false, public: false };
  // TODO: split the header into directives (commas inside "..." do not split),
  // read each name case-insensitively, and fill in result.
  return result;
}
