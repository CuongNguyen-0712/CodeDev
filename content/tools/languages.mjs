/**
 * Challenge languages of the content pipeline. Keys match challenge.coding.language, the code
 * runner (sandbox/server.mjs) and services/challenge.service.js LANGUAGE_FILES.
 *
 * javascript runs in the browser too ("function" mode: starter + harness.js). Every other language
 * runs only in the code runner ("stdio" mode): the test input arrives on stdin (a string as is,
 * anything else as JSON) and stdout is graded (lib/challenges/compare.js stdoutMatches).
 */
export const LANGUAGES = {
    javascript: { ext: "js", contentType: "application/javascript; charset=utf-8" },
    python: { ext: "py", contentType: "text/x-python; charset=utf-8" },
    c: { ext: "c", contentType: "text/x-c; charset=utf-8" },
    cpp: { ext: "cpp", contentType: "text/x-c++src; charset=utf-8" },
    java: { ext: "java", contentType: "text/x-java; charset=utf-8" },
    go: { ext: "go", contentType: "text/x-go; charset=utf-8" },
    rust: { ext: "rs", contentType: "text/x-rust; charset=utf-8" },
};

/** Language of a coding challenge from challenges.json (javascript when unset). */
export function challengeLanguage(challenge) {
    const language = challenge.coding?.language || "javascript";
    if (!LANGUAGES[language]) throw new Error(`${challenge.publicId}: unsupported language "${language}"`);
    return language;
}
