import { readFileSync } from "node:fs";

// A tiny dependency injection container, the mechanism behind NestJS constructor injection.
//
// Every provider has a token and the tokens of its dependencies (its constructor parameters,
// in order). The container is built from a list of providers; when the same token is
// registered twice, the later one replaces the earlier one (that is how a test swaps the real
// repository for a fake).
//
// Write resolve(token, requiredBy):
//   1. If the token was already constructed, return the cached instance (every provider is a
//      singleton: constructed at most once per container).
//   2. If no provider is registered for the token, throw new MissingProviderError(token, requiredBy).
//      requiredBy is the token of the provider that asked for it, or null when the token was
//      requested directly (from the test runner).
//   3. Otherwise resolve each dependency, in the order listed, passing this token as requiredBy.
//      Only then construct the provider: push its token to this.constructed and create
//      { token, serial: this.constructed.length, deps: <the resolved dependency instances> }.
//      Cache it and return it.
// No provider in the tests depends on itself, directly or through others (cycles are lesson 9).
// Do not change the types, MissingProviderError, the constructor or the test runner.

type ProviderDef = { token: string; deps: string[] };
type Instance = { token: string; serial: number; deps: Instance[] };

class MissingProviderError extends Error {
    constructor(readonly token: string, readonly requiredBy: string | null) {
        super(`No provider for ${token}` + (requiredBy ? ` (required by ${requiredBy})` : ""));
    }
}

class Container {
    private readonly registry = new Map<string, ProviderDef>();
    private readonly cache = new Map<string, Instance>();
    readonly constructed: string[] = [];

    constructor(providers: ProviderDef[]) {
        for (const p of providers) this.registry.set(p.token, p);
    }

    resolve(token: string, requiredBy: string | null = null): Instance {
        const cached = this.cache.get(token);
        if (cached) return cached;
        const def = this.registry.get(token);
        if (!def) throw new MissingProviderError(token, requiredBy);
        this.constructed.push(token);
        const instance: Instance = { token, serial: this.constructed.length, deps: [] };
        this.cache.set(token, instance);
        instance.deps = def.deps.map((dep) => this.resolve(dep, token));
        return instance;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { providers: ProviderDef[]; resolve: string[] } = JSON.parse(readFileSync(0, "utf8"));
const container = new Container(input.providers);
try {
    const resolved = input.resolve.map((token) => container.resolve(token).serial);
    console.log(JSON.stringify({ order: container.constructed, resolved }));
} catch (e) {
    if (!(e instanceof MissingProviderError)) throw e;
    console.log(JSON.stringify({ error: "MissingProvider", token: e.token, requiredBy: e.requiredBy }));
}
