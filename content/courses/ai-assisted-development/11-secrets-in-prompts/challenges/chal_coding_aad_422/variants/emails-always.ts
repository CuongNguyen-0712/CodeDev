import { readFileSync } from "node:fs";

// Known wrong answer.

type SecretType = "private_key" | "password" | "jwt" | "api_key" | "bearer" | "env" | "email";

type Redaction = { text: string; counts: Record<SecretType, number> };

const SENSITIVE_WORDS = new Set(["SECRET", "TOKEN", "PASSWORD", "PASSWD", "PWD", "KEY", "APIKEY", "CREDENTIALS"]);

function redactSecrets(text: string, options: { redactEmails: boolean }): Redaction {
    const counts: Record<SecretType, number> = { private_key: 0, password: 0, jwt: 0, api_key: 0, bearer: 0, env: 0, email: 0 };
    const mark = (type: SecretType) => {
        counts[type]++;
        return `[REDACTED:${type}]`;
    };

    let out = text.replace(
        /-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(-----END ([A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
        () => mark("private_key"),
    );
    out = out.replace(
        /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:@\/]*):[^\s@\/]+@/g,
        (_, prefix: string) => `${prefix}:${mark("password")}@`,
    );
    out = out.replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, () => mark("jwt"));
    out = out.replace(
        /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}|(?<![A-Za-z0-9_])ghp_[A-Za-z0-9]{20,}|(?<![A-Za-z0-9])AKIA[A-Z0-9]{16}(?![A-Za-z0-9])/g,
        () => mark("api_key"),
    );
    out = out.replace(/\b(bearer\s+)[A-Za-z0-9._~+\/-]{16,}=*/gi, (_, prefix: string) => `${prefix}${mark("bearer")}`);
    out = out.replace(/^([ \t]*(?:export[ \t]+)?)([A-Z][A-Z0-9_]*)([ \t]*=[ \t]*)(.*)$/gm, (line: string, lead: string, key: string, eq: string, value: string) => {
        if (value === "" || value.includes("[REDACTED:")) return line;
        if (!key.split("_").some((word) => SENSITIVE_WORDS.has(word))) return line;
        return `${lead}${key}${eq}${mark("env")}`;
    });
    if (options.redactEmails || true) {
        out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => mark("email"));
    }
    return { text: out, counts };
}

// ---------------------------------------------------------------- test runner (do not change)
type Input = { text: string; redactEmails: boolean };

const TYPES: SecretType[] = ["private_key", "password", "jwt", "api_key", "bearer", "env", "email"];
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const result = redactSecrets(input.text, { redactEmails: input.redactEmails });
console.log(JSON.stringify({ text: result.text, counts: Object.fromEntries(TYPES.map((t) => [t, result.counts[t] ?? 0])) }));
