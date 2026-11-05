// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-dkn-1-1",
    title: "Package the API: a multi-stage Dockerfile",
    slug: { _type: "slug", current: "docker-multi-stage-dockerfile-node-api" },
    description:
        "Rice Rocket's api image is 1.5 GB, carries the TypeScript compiler and the source code, runs as root and is killed on every deploy. Learn the four things a production Dockerfile has to get right - stages, what reaches the final image, the user, and PID 1 - and rewrite the api Dockerfile as a multi-stage build.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api (Node 24, TypeScript compiled to dist/) moves from `npm start` on a laptop to one VPS. The first image works, but it is 1.5 GB, every pull on the VPS takes two minutes, a security scan lists 900 packages including the compiler, and every deploy waits 10 seconds before Docker kills the old container.",
    },

    content: [
        h2("Situation"),
        p("This is the Dockerfile that shipped on day one. Every line is valid, and the container serves traffic:"),
        code("dockerfile", `
FROM node:24
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
EXPOSE 3000
CMD npm start`, "Dockerfile"),
        p("Four problems hide in it: the full `node:24` base (a whole Debian with compilers), every devDependency and the TypeScript source in the image, the root user, and a CMD that does not stop cleanly. You fix all four with one technique and two lines."),

        h2("The core you need"),
        bullets([
            "**Layers only add.** Each `RUN`, `COPY` and `ADD` adds a layer on top of the previous ones. Deleting files in a later layer hides them but still ships the bytes.",
            "**Only the last stage is the image.** A Dockerfile can have several `FROM` lines. Earlier stages are scratch space; `COPY --from=<stage>` picks the files you want out of them.",
            "**Build needs more than run.** `npm run build` needs the devDependencies (typescript). `node dist/server.js` needs `dist/`, `package.json` and the production `node_modules` only.",
            "**PID 1 receives the signals.** `docker stop` sends SIGTERM to PID 1, then SIGKILL after 10 seconds. With the shell form `CMD npm start`, PID 1 is `/bin/sh`, which does not forward the signal. The exec form `CMD [\"node\", \"dist/server.js\"]` makes node PID 1.",
            "**The official node images ship a `node` user.** `USER node` costs one line and removes root from the container.",
        ]),

        h2("Apply it in the project"),
        p("The api repository looks like this. The build context is the repository root:"),
        code("text", `
api/
  Dockerfile
  package.json
  package-lock.json
  tsconfig.json
  src/server.ts        -> compiled to dist/server.js
  .env                 (local secrets, never in an image)
  .git/`, "tree"),
        p("Split the Dockerfile into a build stage that has everything, and a runtime stage that receives only the result:"),
        code("dockerfile", `
# 1. Build stage: compiler and devDependencies live here only.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# 2. Runtime stage: a clean base plus three paths.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`, "Dockerfile"),
        callout("warning", "Set NODE_ENV=production in the runtime stage only",
            "npm ci skips devDependencies when NODE_ENV is production. Set it in the build stage and npm run build fails with \"tsc: not found\"."),

        h2("Verify"),
        code("bash", `
docker build -t rice-rocket/api:dev .
docker image ls rice-rocket/api        # SIZE: about 250 MB instead of 1.5 GB
docker run --rm rice-rocket/api:dev whoami                          # node
docker run --rm rice-rocket/api:dev ls                              # dist  node_modules  package.json
docker run -d --name api rice-rocket/api:dev && time docker stop api  # well under 10 s`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`COPY --from=build /app ./` copies everything back.** You get the source and the dev `node_modules` again. Copy the three paths by name, then check with `docker run --rm <image> ls`.",
            "**`npm prune` before `npm run build`.** The compiler is gone when the build needs it. Prune after building, in the same stage.",
            "**Exec form with a shell feature.** `CMD [\"node\", \"$ENTRY\"]` does not expand variables: there is no shell. Use a fixed path, or ENTRYPOINT with a small script that ends in `exec node ...`.",
        ]),

        challenge("chal_quiz_dkn_111"),
        p("Now assemble the api Dockerfile. The editor starts from the finished multi-stage file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose, so pick by the rules above. Run builds the result with a simulator and reports each check."),
        challenge("chal_coding_dkn_112"),
    ],
});
