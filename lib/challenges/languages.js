/**
 * Config-file challenges (Dockerfile, nginx.conf, compose/workflow YAML, Terraform HCL): the learner edits a
 * config file and a javascript harness grades it. They run exactly like javascript challenges
 * (browser Web Worker, or the code runner in "function" mode): the file text becomes the global
 * `__source` and there is no entry function, so `__harness(input, ctx)` reads `__source`.
 * Shared by the browser, the server and content/tools.
 */
export const CONFIG_LANGUAGES = {
    dockerfile: { ext: "Dockerfile", mime: "text/plain" },
    nginx: { ext: "conf", mime: "text/plain" },
    yaml: { ext: "yml", mime: "application/yaml" },
    hcl: { ext: "tf", mime: "text/plain" },
};

export const isConfigLanguage = (language) => Object.hasOwn(CONFIG_LANGUAGES, language || "");

/** javascript and config challenges run in the browser and are graded on the harness result. */
export const isBrowserLanguage = (language) => (language || "javascript") === "javascript" || isConfigLanguage(language);

/** What the javascript runner executes for a challenge's source text. */
export function toRunnableCode(language, source) {
    return isConfigLanguage(language) ? `const __source = ${JSON.stringify(String(source ?? ""))};` : source;
}

/** Language the code runner is asked for: config challenges run as javascript. */
export const runnerLanguage = (language) => (isConfigLanguage(language) ? "javascript" : language || "javascript");
