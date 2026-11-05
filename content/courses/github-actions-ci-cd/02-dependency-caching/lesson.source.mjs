// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-1-2",
    title: "Caching dependencies without stale builds",
    slug: { _type: "slug", current: "github-actions-dependency-caching" },
    description:
        "Rice Rocket's CI spent 2.5 of its 4 minutes downloading packages, and the first cache added to fix it restored an old node_modules and failed with `Cannot find module 'zod'`. Learn how actions/cache keys, restore-keys and branch scopes work, cache npm's download cache instead of node_modules, and always install from the lockfile.",
    estimatedTime: 14,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The CI workflow from lesson 1 runs on every pull request, and the team waits about 4 minutes for each run. Most of that is `npm ci` downloading the same packages again. A teammate's cache made runs fast for a week, then a lockfile change broke CI with an error nobody could reproduce on a laptop.",
    },

    content: [
        h2("Situation"),
        p("This is the cache the teammate added to the test job. It made a run take 70 seconds instead of 4 minutes:"),
        code("yaml", `
      - uses: actions/cache@v4
        id: npm-cache
        with:
          path: api/node_modules
          key: api-deps
      - run: npm ci
        if: steps.npm-cache.outputs.cache-hit != 'true'
      - run: npm test`, ".github/workflows/ci.yml"),
        p("A week later a pull request added `zod` to `api/package.json` and `api/package-lock.json`. Every run since then fails the same way, and `npm test` passes on every laptop:"),
        code("text", `
Run actions/cache@v4
Cache restored successfully
Cache restored from key: api-deps
Run npm ci
  (skipped: the condition evaluated to false)
Run npm test
Error: Cannot find module 'zod'
Require stack:
- /home/runner/work/app/app/api/src/orders/schema.js`, "test job log"),

        h2("The core you need"),
        bullets([
            "**A cache entry is immutable.** `actions/cache` restores at its step and saves in a post step at the end of a successful job, and only when the key did not hit exactly. A key that exists is never overwritten, so `api-deps` keeps the first week's `node_modules` forever.",
            "**The key says what the content depends on.** `npm-${{ runner.os }}-${{ hashFiles('api/package-lock.json') }}` changes when the lockfile changes and differs per operating system. `hashFiles()` returns an empty string when its pattern matches no file, so a wrong path silently gives every run the same key.",
            "**`restore-keys` is the fallback.** When the exact key misses, each `restore-keys` line is tried as a prefix, and the newest entry that starts with it is restored. That is a partial hit: `cache-hit` is `false`, and the job saves a new entry under the exact key at the end.",
            "**Cache the downloads, not `node_modules`.** `npm ci` deletes `node_modules` before it installs, so a restored `node_modules` is thrown away; skipping `npm ci` to keep it means testing whatever lockfile was cached. `~/.npm` holds npm's download cache: `npm ci` still installs exactly the lockfile, but fetches only the packages the cache lacks.",
            "**`setup-node` can do it for you.** `cache: npm` with `cache-dependency-path: api/package-lock.json` on `actions/setup-node` caches `~/.npm` with a lockfile-based key. Write `actions/cache` yourself when you want to see and control the key.",
            "**Caches are scoped by branch.** A run can restore caches saved by its own branch and by the default branch (`main`), never by a sibling branch, so a pull request gets main's cache on its first run. A repository keeps 10 GB of caches by default; entries unused for 7 days and the least recently used ones above the limit are evicted.",
        ]),

        h2("Apply it in the project"),
        p("Replace the cache step: keep `~/.npm`, key it on the operating system and the api's lockfile, fall back to the newest cache of the same operating system, and always run `npm ci`:"),
        code("yaml", `
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: api/.nvmrc
      - name: Restore the npm cache
        id: npm-cache
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-\${{ runner.os }}-\${{ hashFiles('api/package-lock.json') }}
          restore-keys: |
            npm-\${{ runner.os }}-
      - run: npm ci          # always: node_modules comes from the lockfile, never from the cache
      - run: npm test`, ".github/workflows/ci.yml"),
        callout("info", "The same thing in two lines",
            "`actions/setup-node@v5` with `cache: npm` and `cache-dependency-path: api/package-lock.json` restores and saves `~/.npm` with a key built from the lockfile hash. Use it in new workflows; the explicit step above shows what it does."),

        h2("Verify"),
        p("Push twice, then change the lockfile, and read the cache step of each run:"),
        code("text", `
# run 1 on main: nothing saved yet
Cache not found for input keys: npm-Linux-3f9c1e..., npm-Linux-
Run npm ci              added 412 packages in 48s
Post Restore the npm cache   Cache saved with key: npm-Linux-3f9c1e...

# run 2, same lockfile
Cache restored from key: npm-Linux-3f9c1e...
Run npm ci              added 412 packages in 9s

# run 3, zod added to the lockfile
Cache restored from key: npm-Linux-3f9c1e...    (restore-keys match, cache-hit=false)
Run npm ci              added 413 packages in 11s
Post Restore the npm cache   Cache saved with key: npm-Linux-8b27d4...`, "Actions log"),
        code("bash", `
gh cache list --key npm-          # one entry per lockfile hash and OS
gh cache delete npm-Linux-3f9c1e... # drop a bad entry by hand if one is ever saved`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A key that never changes.** `hashFiles('package-lock.json')` at the repository root matches nothing when the lockfile lives in `api/`, so the key ends in an empty string. Detect it in the log: the same key is restored after a lockfile change and the post step says the cache already exists.",
            "**Skipping the install on a hit.** `if: steps.npm-cache.outputs.cache-hit != 'true'` on `npm ci` turns a cache into the source of truth for dependencies. Detect it when the install step shows as skipped in a run; remove the condition.",
            "**Caching across operating systems.** A key without `runner.os` lets a Windows job ask for an entry saved on Linux; it misses anyway, because entries are versioned by OS and paths, and the misleading key hides why. Keep `runner.os` in both the key and the restore prefix.",
        ]),

        p("Now write the cache step yourself. The editor holds the test job with the cache inputs and the install step missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first cache's mistakes on purpose. Run replays a series of CI runs on main, on feature branches and on Windows against a simulator of actions/cache."),
        challenge("chal_coding_gha_122"),
    ],
});
