// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-2-1",
    title: "Build and push a traceable image",
    slug: { _type: "slug", current: "github-actions-build-push-traceable-image" },
    description:
        "Rice Rocket's images were built on laptops and pushed as `latest`, so nobody knew which commit ran on the VPS and a rollback meant rebuilding old code. Learn how GHCR, the job token, docker/metadata-action and docker/build-push-action turn every commit into an image tagged with its own SHA, build on pull requests without pushing, and reuse the layer cache between runs.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "CI now tests every pull request, but the image that reaches the VPS still comes from whoever ran `docker push` last. Last week the api returned 500s after a deploy, and nobody could say which commit `rice-rocket/api:latest` was built from. The first workflow written to fix it pushed from pull requests too, and broke on the first pull request from a fork.",
    },

    content: [
        h2("Situation"),
        p("This is how the image reached the VPS until now, from a laptop:"),
        code("bash", `
cd api
docker build -t ghcr.io/rice-rocket/api:latest .
docker push ghcr.io/rice-rocket/api:latest
ssh deploy@203.0.113.10 'cd /srv/rice-rocket && docker compose pull && docker compose up -d'`, "terminal"),
        p("A teammate then wrote a first workflow, and it went wrong on its first busy day:"),
        code("yaml", `
on: [push, pull_request]
jobs:
  image:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: lan-nguyen
          password: \${{ secrets.GHCR_PAT }}       # Lan's personal token
      - uses: docker/build-push-action@v6
        with:
          context: api
          push: true
          tags: ghcr.io/rice-rocket/api:latest`, ".github/workflows/image.yml"),
        bullets([
            "`docker inspect` on the VPS shows `ghcr.io/rice-rocket/api:latest`, which names no commit. Rolling back meant checking out an older commit and rebuilding it, with whatever versions the base image had that day.",
            "Every pull request pushed `latest`, so an unmerged branch was briefly the image the next `docker compose pull` would fetch.",
            "A pull request from a fork failed at the login step: `Error: Password required`. Repository secrets are not given to workflows triggered from forks.",
        ]),

        h2("The core you need"),
        bullets([
            "**GHCR and the job token.** Images live at `ghcr.io/<owner>/<name>`. `docker/login-action` signs in with `username: ${{ github.actor }}` and `password: ${{ secrets.GITHUB_TOKEN }}`, the token GitHub creates for each job. It can push only when the workflow grants `permissions: packages: write`; no personal token is needed, and none leaves with a teammate.",
            "**A tag that names the source.** `sha-1a2b3c4` points at one commit forever; the VPS runs that tag, and a rollback is a deploy of an older `sha-` tag, not a rebuild. Moving tags (`main`, `latest`) are fine as labels for people, never as what production runs.",
            "**`docker/metadata-action` computes the tags from the event.** Each line of its `tags:` input is a rule: `type=sha` gives `sha-<7 chars>` every time, `type=ref,event=branch` the branch name on a branch push, `type=ref,event=pr` gives `pr-42`, and `type=semver,pattern={{version}}` / `pattern={{major}}.{{minor}}` give `1.4.0` / `1.4` on the git tag `v1.4.0`. With the default `latest=auto` it adds `latest` on such a release. It also outputs OCI labels such as `org.opencontainers.image.revision=<full sha>`.",
            "**Build on pull requests, push from main and tags.** `push: ${{ github.event_name != 'pull_request' }}` on `docker/build-push-action` still builds the image on a pull request (a broken Dockerfile fails the check) but uploads nothing, and the login step gets the same condition in its `if:`. A pull request from a fork gets a read-only token whatever `permissions:` says, so it could never push anyway.",
            "**Layer cache between runs.** Each run starts on a fresh machine. `cache-from: type=gha` and `cache-to: type=gha,mode=max` store the BuildKit layer cache in the GitHub Actions cache; `mode=max` also keeps the layers of the build stage of a multi-stage Dockerfile. It needs `docker/setup-buildx-action` first.",
        ]),

        h2("Apply it in the project"),
        p("One workflow builds the image of `api/` for every pull request into main and pushes it for main and for release tags:"),
        code("yaml", `
name: image

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
    tags: ["v*.*.*"]

permissions:
  contents: read
  packages: write

jobs:
  image:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        if: github.event_name != 'pull_request'
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/rice-rocket/api
          tags: |
            type=sha
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
      - uses: docker/build-push-action@v6
        with:
          context: api
          push: \${{ github.event_name != 'pull_request' }}
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`, ".github/workflows/image.yml"),
        p("What each event produces:"),
        bullets([
            "Pull request #42: builds `pr-42` and `sha-9f8e7d6`, pushes nothing, signs in to nothing.",
            "Push to main at `1a2b3c4...`: pushes `main` and `sha-1a2b3c4`.",
            "Git tag `v1.4.0`: pushes `1.4.0`, `1.4`, `latest` and `sha-4c5d6e7`.",
            "Push to `feature/momo-pay`: the workflow does not start (`branches: [main]`).",
        ]),
        p("The VPS stops pulling `latest`. The compose file reads the tag from the environment, and a deploy names the commit:"),
        code("yaml", `
  api:
    image: ghcr.io/rice-rocket/api:\${API_TAG:?set API_TAG to a sha- tag}`, "compose.yaml (api service)"),
        callout("info", "Why the first push creates a private package",
            "The first push to `ghcr.io/rice-rocket/api` creates the package as private and links it to the repository that pushed it. A package first pushed from a laptop is not linked to `rice-rocket/app`, and the job token then gets `denied`; connect the repository under the package's \"Manage Actions access\" settings once."),

        h2("Verify"),
        code("bash", `
gh run list --workflow image.yml --limit 3
# completed  success  Merge pull request #42 ...  main  push
docker buildx imagetools inspect ghcr.io/rice-rocket/api:sha-1a2b3c4 | head -3
# Name:      ghcr.io/rice-rocket/api:sha-1a2b3c4
docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \\
  ghcr.io/rice-rocket/api:sha-1a2b3c4
# 1a2b3c4d5e6f708192a3b4c5d6e7f80912345678
ssh deploy@203.0.113.10 'cd /srv/rice-rocket && API_TAG=sha-1a2b3c4 docker compose up -d api'
ssh deploy@203.0.113.10 'docker compose -f /srv/rice-rocket/compose.yaml images api'
# rice-rocket-api-1  ghcr.io/rice-rocket/api  sha-1a2b3c4  ...`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Running `latest` in production.** Any `docker compose pull` (a reboot script, a teammate) silently changes the version. Detect it with `docker compose images` showing `latest`; deploy a `sha-` tag instead.",
            "**`cache-to: type=gha` without Buildx.** The default `docker` driver cannot export a cache: `Cache export is not supported for the docker driver`. Add `docker/setup-buildx-action` before the build step.",
            "**`denied: installation not allowed to Write organization package`.** The workflow lacks `packages: write`, or the package was created from a laptop and is not linked to the repository. Check the workflow's `permissions:` first, then the package's Actions access.",
        ]),

        p("Now write the image workflow. The editor holds `.github/workflows/image.yml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first workflow's mistakes on purpose. Run plays a pull request, a push to main, a release tag and a fork's pull request through a simulator of the triggers and the three Docker actions."),
        challenge("chal_coding_gha_142"),
    ],
});
