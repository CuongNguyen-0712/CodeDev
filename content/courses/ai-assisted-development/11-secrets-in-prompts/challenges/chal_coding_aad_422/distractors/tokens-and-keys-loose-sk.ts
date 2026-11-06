// @piece tokens-and-keys: JWTs and provider API keys
out = out.replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, () => mark("jwt"));
out = out.replace(
    /sk-[A-Za-z0-9_-]{20,}|(?<![A-Za-z0-9_])ghp_[A-Za-z0-9]{20,}|(?<![A-Za-z0-9])AKIA[A-Z0-9]{16}(?![A-Za-z0-9])/g,
    () => mark("api_key"),
);
