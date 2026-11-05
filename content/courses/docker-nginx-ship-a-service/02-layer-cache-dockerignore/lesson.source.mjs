// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-1-2",
    title: "Builds in seconds: layer cache and .dockerignore",
    slug: { _type: "slug", current: "docker-layer-cache-dockerignore-node-api" },
    description:
        "Rice Rocket's api image is small now, but every build reinstalls every dependency and ships half a gigabyte of build context, so a one-line fix takes six minutes in CI. Learn how BuildKit decides that a step is cached, order the build stage by how often its inputs change, write a .dockerignore, and carry the cache to a CI runner that starts empty.",
    estimatedTime: 14,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Every pull request waits about six minutes for the api image, even for a typo in README.md. The team merges less often to avoid the wait, and hotfixes during the lunch rush take as long as features.",
    },

    content: [
        h2("Situation"),
        p("The multi-stage Dockerfile from lesson 1 produces a good image, but its build stage starts like this, and the repository has no .dockerignore:"),
        code("dockerfile", `
FROM node:24-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build && npm prune --omit=dev`, "Dockerfile (build stage)"),
        p("A CI build after a one-line change in `src/orders.ts` prints this (trimmed):"),
        code("text", `
#4 [internal] load build context
#4 transferring context: 468.20MB 23.6s done
#6 [build 3/5] COPY . .
#6 DONE 4.1s
#7 [build 4/5] RUN npm ci
#7 DONE 92.4s
#8 [build 5/5] RUN npm run build && npm prune --omit=dev
#8 DONE 19.0s`, "docker build --progress=plain"),
        p("Two separate problems: the context carries the host `node_modules` and `.git` (468 MB sent on every build), and `COPY . .` puts every file in front of `npm ci`, so any edit reinstalls every dependency."),

        h2("The core you need"),
        bullets([
            "**Each step has a cache key.** For `COPY` and `ADD` it is a checksum of the copied files' contents and permissions (modification times are ignored). For `RUN` it is the command text: Docker does not look at what the command downloads.",
            "**The first miss rebuilds the rest of the stage.** A layer sits on top of the previous one, so a step is reused only if every step above it in the stage was reused. Order the steps from \"changes rarely\" to \"changes on every commit\".",
            "**`npm ci` reads two files.** It installs exactly what `package-lock.json` says, fails if `package.json` and the lock file disagree, and starts from an empty `node_modules`. Copy those two files, run it, and only then copy the source.",
            "**The build context is what the builder sees.** `docker build .` sends the directory, minus the paths matched by `.dockerignore`. An ignored file cannot be copied, cannot change a cache key, and costs nothing to send.",
            "**The cache lives in the builder.** BuildKit (the default builder since Docker Engine 23) keeps layers on the machine that built them. A fresh CI runner has none until you import them with `--cache-from`.",
        ]),

        h2("Apply it in the project"),
        p("First, keep everything the image does not need out of the context. Add `.dockerignore` next to the Dockerfile:"),
        code("text", `
# Built or installed inside the image, never copied from the host
node_modules
dist
# Not needed to build, and must never reach a layer
.git
.env
# Docs and build files: editing them should not rebuild anything
*.md
Dockerfile
.dockerignore`, ".dockerignore"),
        p("Then reorder the build stage so the expensive install depends on the lock file only. The runtime stage from lesson 1 does not change:"),
        code("dockerfile", `
# 1. Build stage, ordered by how often the inputs change.
FROM node:24-slim AS build
WORKDIR /app
# Changes when a dependency changes; npm ci stays cached until then.
COPY package.json package-lock.json ./
RUN npm ci
# Changes rarely.
COPY tsconfig.json ./
# Changes on every commit, so it comes last.
COPY src ./src
RUN npm run build && npm prune --omit=dev

# 2. Runtime stage: unchanged from lesson 1.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`, "Dockerfile"),
        p("Finally, give the CI runner the previous build's layers. Push the cache to the registry next to the image and pull it back on the next run. Cache export needs a BuildKit builder with the docker-container driver (the default docker driver cannot export it; `docker/setup-buildx-action` creates one on GitHub Actions):"),
        code("bash", `
docker buildx create --use --driver docker-container
docker buildx build \\
  --cache-from type=registry,ref=registry.example.com/rice-rocket/api:buildcache \\
  --cache-to type=registry,ref=registry.example.com/rice-rocket/api:buildcache,mode=max \\
  -t registry.example.com/rice-rocket/api:$GIT_SHA --push .`, "ci/build.sh"),
        callout("info", "Why mode=max",
            "The default cache export (mode=min) only contains the layers of the final image. npm ci runs in the build stage, so without mode=max the layer you most want to reuse is not exported. On GitHub Actions, type=gha does the same job without a registry."),

        h2("Verify"),
        code("bash", `
docker build -t rice-rocket/api:dev .                       # first build: every step runs
echo "// lunch-rush fix" >> src/orders.ts
docker build --progress=plain -t rice-rocket/api:dev .      # rebuild after a source edit`, "terminal"),
        p("Expected in the second build: a context of kilobytes, `CACHED` down to the source copy, and only the compile running:"),
        code("text", `
#4 transferring context: 318.52kB 0.0s done
#6 [build 3/7] COPY package.json package-lock.json ./
#6 CACHED
#7 [build 4/7] RUN npm ci
#7 CACHED
#8 [build 5/7] COPY tsconfig.json ./
#8 CACHED
#9 [build 6/7] COPY src ./src
#9 DONE 0.0s
#10 [build 7/7] RUN npm run build && npm prune --omit=dev
#10 DONE 15.2s`, "expected output (trimmed)"),
        p("Then edit `README.md` and build again: every step should be `CACHED`. Change a version in `package.json`, run `npm install` to update the lock file, and build: `RUN npm ci` must run again."),

        h2("Pitfalls"),
        bullets([
            "**`COPY *.json ./` before `npm ci`.** It looks tidy, but it also copies `tsconfig.json`, so a compiler option change reinstalls every dependency. Detect it by editing tsconfig.json and checking whether `RUN npm ci` says `CACHED`.",
            "**`COPY package.json ./` then `RUN npm install`.** The lock file is not part of the cache key, so an update that only changes the lock file keeps the old layer, and a cold build resolves versions again instead of installing the locked ones. Copy both files and use `npm ci`, which fails loudly when they disagree.",
            "**`*.md` only matches at the root.** `.dockerignore` patterns are anchored to the context root: `*.md` ignores README.md but not docs/setup.md. Use `**/*.md` for every level, and watch the `transferring context` size in the build log after changing the file.",
        ]),

        challenge("chal_quiz_dkn_121"),
        p("Now fix the api Dockerfile. The editor starts from the finished file with the build-stage steps missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose: pick the ones that keep `npm ci` cached. Run rebuilds the result with a layer-cache simulator after the changes each check describes and reports which steps ran again."),
        challenge("chal_coding_dkn_122"),
    ],
});
