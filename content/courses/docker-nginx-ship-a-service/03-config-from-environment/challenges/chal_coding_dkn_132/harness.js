// Harness: calls the learner's loadConfig(env, files) and turns the outcome into JSON.
// input: { env: { NAME: "value" }, files: { "/run/secrets/jwt_secret": "..." } }
// Output: { ok: true, frozen: <Object.isFrozen(result)>, config: <result> }
//      or { ok: false, errors: <the thrown Error's message split on "; "> }
async function __harness(input) {
    const env = { ...(input.env || {}) };
    const files = { ...(input.files || {}) };
    try {
        const config = loadConfig(env, files);
        return { ok: true, frozen: Object.isFrozen(config), config: config === undefined ? null : config };
    } catch (error) {
        if (!(error instanceof Error)) return { ok: false, thrown: String(error) };
        return { ok: false, errors: error.message.split("; ") };
    }
}
