import { readFileSync } from "node:fs";

// CodeDev "paste to AI" guard: a developer pasted a failing job's log and the production .env into a
// chat with an AI assistant. Before any text goes into a prompt, replace the secrets in it with typed
// placeholders "[REDACTED:<type>]" and keep every other character exactly as it was (line endings too).
//
// redactSecrets(text, { redactEmails }) returns { text, counts } where counts has one number per type.
// Apply the rules in this order; each rule works on the output of the previous one:
//   1. private_key  "-----BEGIN <words> PRIVATE KEY-----" (<words> = zero or more words of A-Z 0-9,
//                   e.g. "RSA", "OPENSSH") up to and including the next "-----END <words> PRIVATE KEY-----";
//                   with no END line, up to the end of the text. The whole block becomes the placeholder.
//                   "-----BEGIN PUBLIC KEY-----" is not a secret.
//   2. password     in a URL "scheme://user:password@host" (scheme starts with a letter, then letters,
//                   digits, + . -; the user may be empty, as in "redis://:pass@host"), replace only the
//                   password: everything after the ":" that follows the user, up to "@", with no
//                   whitespace, "/" or "@" in it. Keep the scheme, user, host, port and path.
//   3. jwt          "eyJ<chars>.eyJ<chars>.<chars>" with <chars> = A-Z a-z 0-9 _ - (at least one each),
//                   not preceded by a letter, digit or _.
//   4. api_key      "sk-" + at least 20 of A-Z a-z 0-9 _ -     not preceded by A-Z a-z 0-9 _ -
//                   "ghp_" + at least 20 of A-Z a-z 0-9         not preceded by A-Z a-z 0-9 _
//                   "AKIA" + exactly 16 of A-Z 0-9              not preceded or followed by A-Z a-z 0-9
//                   Each key runs as far as its characters allow.
//   5. bearer       the word "Bearer" (any case), whitespace, then a token of at least 16 characters of
//                   A-Z a-z 0-9 . _ ~ + / - followed by any "=" padding: replace only the token
//                   ("Bearer [REDACTED:bearer]").
//   6. env          a whole line "NAME=value": optional spaces or tabs, an optional "export ", NAME made of
//                   A-Z 0-9 _ starting with A-Z, then "=" (spaces or tabs around it allowed), then the value
//                   to the end of the line. NAME is sensitive when one of its "_"-separated words is SECRET,
//                   TOKEN, PASSWORD, PASSWD, PWD, KEY, APIKEY or CREDENTIALS. Replace the whole value (quotes
//                   included) of a sensitive NAME, unless the value is empty or already contains "[REDACTED:".
//   7. email        only when redactEmails is true: <local>@<domain> with local = A-Z a-z 0-9 . _ % + -
//                   and domain = A-Z a-z 0-9 . - ending in "." and at least 2 letters.
// counts[type] = how many placeholders of that type were written.
//
// Do not change the types or the test runner.

type SecretType = "private_key" | "password" | "jwt" | "api_key" | "bearer" | "env" | "email";

type Redaction = { text: string; counts: Record<SecretType, number> };

function redactSecrets(text: string, options: { redactEmails: boolean }): Redaction {
    const counts: Record<SecretType, number> = { private_key: 0, password: 0, jwt: 0, api_key: 0, bearer: 0, env: 0, email: 0 };
    return { text, counts };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { text, redactEmails }. Output: { text, counts } as JSON.
type Input = { text: string; redactEmails: boolean };

const TYPES: SecretType[] = ["private_key", "password", "jwt", "api_key", "bearer", "env", "email"];
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const result = redactSecrets(input.text, { redactEmails: input.redactEmails });
console.log(JSON.stringify({ text: result.text, counts: Object.fromEntries(TYPES.map((t) => [t, result.counts[t] ?? 0])) }));
