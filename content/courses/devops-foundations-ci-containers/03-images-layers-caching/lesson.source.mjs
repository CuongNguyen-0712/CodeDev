// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-2-1",
    title: "Images, layers & caching",
    slug: { _type: "slug", current: "devops-docker-images-layers-build-cache" },
    description:
        "Every CI build of Rice Rocket's api image took 6 minutes, because the Dockerfile copied the whole project before installing the dependencies: a one-line code change, even a README edit, re-ran pip install. The image was 1.1 GB on top of that. Learn what images, containers and layers are, how the build cache decides what to reuse, how to order a Dockerfile, and how .dockerignore, slim bases, multi-stage builds and pinned digests make images small and builds predictable.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Developers complain that CI takes 6 minutes to build the api image for every push, even when they only fix a typo in the README. Most of that time is pip install downloading and compiling the same dependencies again. The image is also 1.1 GB, so every deploy spends another minute pulling it onto the servers. You are asked to make a code-only change build in seconds and to cut the image size without changing the app.",
    },

    content: [
        h2("1. The incident"),
        p("This is the Dockerfile the api team wrote on their first day with Docker. It works - the app starts - and nobody looked at it again:"),
        code("dockerfile", `
FROM python:3.13
WORKDIR /app
COPY . .
RUN apt-get update
RUN apt-get install -y build-essential libpq-dev
RUN pip install -r requirements.txt
CMD ["python", "-m", "api"]`, "Dockerfile"),
        p("Three months later, CI looks like this for every single push:"),
        bullets([
            "**Every build re-installs everything.** `COPY . .` copies the whole project, so any change - a new route, a test, a README typo - changes that step. Every step after it then runs again, and `pip install` alone takes about 4 minutes.",
            "**The image is 1.1 GB.** The full `python:3.13` base is about 1 GB by itself, `build-essential` adds compilers the running app never uses, and with no `.dockerignore` the `.git` folder, the tests and local virtualenvs are copied in too.",
            "**Deploys are slow too.** Each server pulls the changed layers, and here almost every layer changes on every push.",
        ]),
        p("None of this is a bug in the app. It is the order of seven lines, and what goes into them."),

        h2("2. Reproduce it"),
        p("Use any small Python project with a `requirements.txt` and the Dockerfile above. Build it twice with plain progress output, so you see every step:"),
        code("bash", `
docker build --progress=plain -t api:dev .     # first build: every step runs
docker build --progress=plain -t api:dev .     # second build: nothing changed
echo "typo fix" >> README.md
docker build --progress=plain -t api:dev .     # third build: only README.md changed`),
        p("The second build finishes in about a second: every step prints `CACHED`. The third build is the incident. Its output is similar to this:"),
        code("text", `
#5 [2/6] WORKDIR /app
#5 CACHED

#6 [3/6] COPY . .
#6 DONE 0.3s

#7 [4/6] RUN apt-get update
#7 DONE 6.1s

#8 [5/6] RUN apt-get install -y build-essential libpq-dev
#8 DONE 38.7s

#9 [6/6] RUN pip install -r requirements.txt
#9 DONE 231.4s`),
        p("A README change re-ran `apt-get` and `pip install`. To understand why, you need to know what the build is actually producing."),

        h2("3. Images, containers and layers"),
        bullets([
            "**An image** is a read-only template: a stack of filesystem **layers** plus a small config (the command to run, environment variables, the working directory). You build it once and ship it to a registry.",
            "**A container** is a running process started from an image. Docker puts one thin **writable layer** on top of the image's layers; whatever the process writes goes there and disappears when the container is removed. Ten containers from one image share the same read-only layers.",
            "**A layer** is the set of file changes one instruction made. `RUN`, `COPY` and `ADD` change files, so they create layers with content. `ENV`, `CMD`, `EXPOSE` and `LABEL` only change the config and show up with size `0B`.",
        ]),
        p("`docker history` lists the layers of an image, newest first, with the instruction that made each one and its size:"),
        code("bash", `
docker image ls api            # the total size of the image
docker history api:dev         # one line per layer: CREATED BY and SIZE`),
        p("Two facts about layers matter for everything that follows:"),
        numbered([
            "**Layers only add.** If one `RUN` downloads 300 MB and the next `RUN rm -rf` deletes it, the files are hidden in the newer layer but the 300 MB are still stored in the older one, and every server still downloads them. Delete temporary files **in the same `RUN`** that created them.",
            "**Layers are reused.** If a layer already exists - on your machine, in a CI cache, on the server that pulls the image - Docker does not build or download it again. That is what makes a well-ordered image fast to build and fast to deploy.",
        ]),

        h2("4. How the build cache decides"),
        p("Before running a step, the builder checks whether it already has a layer for exactly that step. For each instruction it compares:"),
        bullets([
            "**The parent**: the layer the step is built on, which is the result of every step above it.",
            "**The instruction text**, exactly as written. `RUN pip install -r requirements.txt` and `RUN pip install --no-cache-dir -r requirements.txt` are different steps.",
            "**For `COPY` and `ADD`: the content of the files they copy.** BuildKit computes a checksum over every copied file: its path, its content and its permissions. A changed byte, a renamed file or a `chmod +x` is a miss; only the modification time is ignored, so touching a file or a fresh `git clone` does not bust the cache.",
        ]),
        p("For `RUN`, the builder does **not** look at what the command would do. `RUN apt-get update` is cached as long as its text and its parent are unchanged - even if the package lists on the internet changed last week. That will matter in section 7."),
        p("And because the parent is part of the check, **one miss invalidates every step below it**. The third build above missed at `COPY . .` (README.md changed), so `apt-get` and `pip install` had a new parent and ran again, although their text was identical."),
        image("cache-order", {
            alt: "Two Dockerfiles for the same commit, in which only app/main.py changed. Left panel, red, titled COPY . . first: FROM python:3.13-slim cached, WORKDIR /app cached, COPY . . BUILD because main.py changed, RUN pip install BUILD because its parent missed, CMD BUILD; footer: pip install runs again, about 4 minutes; every commit pays for all dependencies, even a README fix. Right panel, green, titled requirements.txt first: FROM, WORKDIR, COPY requirements.txt and RUN pip install are all cached, COPY . . is BUILD because main.py changed, CMD is BUILD; footer: only the code layer is rebuilt, about 2 seconds; pip runs again only when requirements.txt itself changes. Bottom note: a step is reused when its parent step, its instruction text and, for COPY and ADD, the content of the copied files are all the same as in an earlier build; order the Dockerfile from what changes least to what changes most.",
            caption: "The cache is checked top to bottom, and the first miss rebuilds everything below it - so put what changes least at the top.",
        }),

        h2("5. Order the Dockerfile for the cache"),
        p("The rule of thumb: **from what changes least to what changes most**. The base image and system packages change a few times a year, `requirements.txt` changes a few times a month, the code changes on every commit. So copy `requirements.txt` alone, install, and only then copy the code:"),
        code("dockerfile", String.raw`
FROM python:3.13-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "-m", "api"]`, "Dockerfile"),
        p("Now a code change misses only at the second `COPY`. Everything above it - including the 4-minute `pip install` - comes from the cache, and the build takes a couple of seconds. When `requirements.txt` changes, the build misses at the first `COPY` and installs again, which is exactly what you want."),
        callout("info", "Same idea in every language",
            "Node copies package.json and package-lock.json and runs npm ci before copying the source. Go copies go.mod and go.sum and runs go mod download. Java copies pom.xml and resolves dependencies first. The dependency manifest goes in alone, the code comes after."),

        h2("6. .dockerignore: decide what is in the build context"),
        p("`docker build .` gives the builder a **build context** - the folder `.`. BuildKit transfers files from it as the steps need them (and only the ones that changed since the last build), but it can only ever see what is in the context. `COPY . .` can only copy what is in the context, and its cache check looks at every file it copies. A `.dockerignore` file next to the Dockerfile removes files from the context before any of that happens:"),
        code("text", `
.git
.venv
__pycache__
**/__pycache__
*.md
tests
.env
Dockerfile
.dockerignore`, ".dockerignore"),
        bullets([
            "**Faster and more stable builds**: `.git` changes on every commit, local virtualenvs are huge, and none of them belong in the image. Ignored files never bust the cache.",
            "**Smaller images**: the 80 MB `.git` folder and the test fixtures are gone from the `COPY . .` layer.",
            "**Fewer leaks**: a local `.env` with passwords never reaches the image (the next lesson is about that).",
        ]),
        p("Patterns use Go's `filepath.Match` rules, relative to the context root: `*` never crosses a `/`, so `*.md` ignores `README.md` but not `docs/setup.md`; `**/*.md` matches at any depth. A line starting with `!` re-includes something an earlier line excluded (`!README.md`)."),

        h2("7. Smaller images"),
        h3("Start from a slim base"),
        p("`python:3.13` is built on a full Debian with compilers and many libraries: about 1 GB. `python:3.13-slim` has the same Python on a minimal Debian: roughly 130 MB. Start from `-slim` and add the few system packages your app really needs. (Alpine images are smaller still, but use musl instead of glibc, so many Python wheels must be compiled from source there.)"),
        h3("One RUN for apt-get update, install and cleanup"),
        p("Look again at the old Dockerfile: `RUN apt-get update` on its own line. That layer is cached by its text, so months later it is still reused, and a new `RUN apt-get install -y something-new` line asks for package versions from months-old lists - which may fail or install outdated packages. Put update, install and cleanup in **one** `RUN`:"),
        code("dockerfile", String.raw`
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*`),
        bullets([
            "Changing the package list changes the whole instruction, so `apt-get update` runs again with it.",
            "`--no-install-recommends` skips optional packages you did not ask for.",
            "`rm -rf /var/lib/apt/lists/*` deletes the downloaded lists in the same layer, so they never reach the image. Same idea for pip: `--no-cache-dir`.",
        ]),
        h3("Multi-stage builds: compile in one stage, ship another"),
        p("Some Python packages need a compiler and header files to install, but the running app needs neither. A **multi-stage build** has several `FROM` lines; only the last stage becomes the image, and it takes from earlier stages only what you `COPY --from` them:"),
        code("dockerfile", String.raw`
# syntax=docker/dockerfile:1
FROM python:3.13-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.13-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /venv /venv
ENV PATH="/venv/bin:$PATH"
WORKDIR /app
COPY . .
CMD ["python", "-m", "api"]`, "Dockerfile"),
        p("`build-essential` and `libpq-dev` exist only in the `build` stage. The final image has the slim base, the runtime library `libpq5`, the virtualenv and the code. For Rice Rocket's api this took the image from 1.1 GB to under 200 MB. BuildKit also skips stages the final image does not need and builds independent stages in parallel."),
        h3("Pin the base image"),
        p("Tags move. `python:3.13-slim` is rebuilt and re-pointed whenever Python or Debian ship fixes, so the same Dockerfile can start from a different base next week. Usually that is good (security fixes), but when you need the exact same base - to reproduce a bug, or for a release - pin its **digest**:"),
        code("dockerfile", `
FROM python:3.13-slim@sha256:<digest from docker buildx imagetools inspect python:3.13-slim>`),
        p("A pinned digest never changes, so update it on purpose - a tool such as Dependabot or Renovate can open a pull request when a new base image is out."),

        h2("8. Cache mounts and CI"),
        p("Layer caching is all-or-nothing: when `requirements.txt` changes by one line, pip downloads every package again. A BuildKit **cache mount** gives a `RUN` step a folder that survives between builds but is never part of the image:"),
        code("dockerfile", `
RUN --mount=type=cache,target=/root/.cache/pip \\
    pip install -r requirements.txt`),
        p("pip keeps its download cache in `/root/.cache/pip`, so after adding one package only that package is downloaded. (Here you want pip's cache, so leave out `--no-cache-dir`.)"),
        callout("warning", "CI runners start empty",
            "A fresh CI runner has no layers from earlier builds, so even a perfect Dockerfile rebuilds everything there unless the pipeline saves and restores the build cache, for example with docker buildx build --cache-from and --cache-to. Lesson 5 covers CI caches; the Dockerfile order you learned here is what makes such a cache useful."),

        h2("9. Your turn"),
        p("First, read a Dockerfile the way the cache does:"),
        challenge("chal_quiz_devf_211", "Walk down the Dockerfile and ask for each step: same parent, same text, same copied content? Remember that ignored files are not in the build context at all."),
        p("Rice Rocket's CI prints a **build plan** before each build: which steps will be `CACHED` and which will `BUILD`, and how long the build will take. The plan has three bugs from this lesson - it forgets that a miss carries down to every later step, it only compares the names of copied files, and it ignores `.dockerignore`. Fix it so the plan matches what the builder really does."),
        challenge("chal_fix_devf_212", "Three small fixes: make each cache key include the key of the step before it, keep the (path, hash) pairs instead of only the paths for COPY and ADD, and skip files that is_ignored() says are not in the build context."),

        h2("10. Pitfalls"),
        bullets([
            "**`COPY . .` before installing dependencies**: every code change re-installs everything.",
            "**No `.dockerignore`**: `.git`, virtualenvs, tests and `.env` files end up in the image and bust the cache.",
            "**`RUN apt-get update` on its own line**: a cached, stale package list is reused with new install lines.",
            "**Deleting files in a later `RUN`**: layers only add, the bytes are still in the image.",
            "**Shipping compilers and headers**: build them in a separate stage and copy only the result.",
            "**Trusting that a tag never moves**: pin a digest when you need the exact same base, and update it on purpose.",
            "**Expecting the cache to survive on a fresh CI runner**: it does not unless the pipeline exports and imports it.",
        ]),

        h2("11. Checklist"),
        bullets([
            "The Dockerfile goes from what changes least (base, system packages) to what changes most (code).",
            "Dependency manifests (`requirements.txt`, lock files) are copied and installed before the rest of the code.",
            "A `.dockerignore` keeps `.git`, virtualenvs, caches, tests and `.env` files out of the build context.",
            "The base is a `-slim` image; build tools live only in a build stage of a multi-stage build.",
            "Each `apt-get update` shares one `RUN` with its install and cleanup; pip uses `--no-cache-dir` or a cache mount.",
            "`docker history` shows no unexpectedly large layers.",
            "The base image is pinned by digest when builds must be reproducible, and the pin is updated on purpose.",
        ]),
    ],
});
