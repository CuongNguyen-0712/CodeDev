// ESLint flat config (ESLint 9+ requires one; `npm run lint` failed without it).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

export default defineConfig([
    ...nextVitals,
    // A hook or component used without its import only fails at runtime (two pages crashed that way).
    { rules: { "no-undef": "error" } },
    { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs", globals: globals.node } },
    globalIgnores([
        ".next/**",
        "out/**",
        "coverage/**",
        "node_modules/**",
        // local tooling / agent worktrees
        ".claude/**",
        ".agents/**",
        "tests/**",
        "db/backups/**",
        // course content: challenge starters contain deliberate bugs and TODOs
        "content/**",
        // generated / third-party
        "sanity/**",
        "app/studio/**",
        "public/**",
    ]),
]);
