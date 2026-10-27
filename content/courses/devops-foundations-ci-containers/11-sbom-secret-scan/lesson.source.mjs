// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-devf-2-3",
    title: "What is inside the image: SBOMs & secret scans",
    slug: { _type: "slug", current: "devops-sbom-secret-scan-image-layers" },
    description:
        "A security advisory for an old PyYAML version reached Rice Rocket, and nobody could say which images contained it: requirements.txt said 6.0.2, but the image also carried 5.3.1. While the team scanned the images to find out, the scanner found the production database password in api v2.9.0 - in a .env file the Dockerfile had deleted. Learn what an image really contains, how an SBOM (a list of every package in it) answers \"are we affected?\" in minutes, why deleting a file in a later layer does not remove it, and how to scan every layer for secrets before an image is pushed.",
    estimatedTime: 25,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On Monday morning the security lead forwards an advisory: PyYAML versions before 5.4 can run attacker-controlled code when they load untrusted YAML. She asks which of Rice Rocket's images are affected. The api team answers \"none, we pin 6.0.2\". You are asked to check the images themselves, and while you do, the scanner reports something worse: a DB_PASSWORD in api v2.9.0, in a file that docker run cannot even see.",
    },

    content: [
        h2("1. The incident"),
        p("Two findings came out of one morning of scanning, and both had the same root: the team knew what they had **written** (a Dockerfile, a `requirements.txt`) but not what they had **shipped** (the bytes in the image)."),
        bullets([
            "**The advisory.** `requirements.txt` pins `PyYAML==6.0.2`, so the api team said \"not affected\". But the image also contains a database migration tool, installed in its own virtualenv in `/opt/migrate`, and that tool pulled in **PyYAML 5.3.1**. Nobody had listed it anywhere.",
            "**The secret.** The Dockerfile of api v2.9.0 ran `COPY . .` while a `.env` file with `DB_PASSWORD=Pr0d-Rice-2026` sat in the project folder. A developer noticed and added `RUN rm -f /app/.env` as the next step. `docker run ... ls -a /app` shows no `.env`, so everyone thought the problem was solved. The image had been in the registry for three weeks, pulled by CI runners, two laptops and a contractor's staging server.",
        ]),
        p("This lesson answers both questions with tools you can run on any image: what packages are in it, and what secrets are in any of its layers."),

        h2("2. Reproduce the hidden secret"),
        p("You only need Docker. Build an image that copies a secret and deletes it in the next step:"),
        code("bash", `
mkdir leak-demo && cd leak-demo
echo 'DB_PASSWORD=not-a-real-password' > .env
echo 'print("hello")' > app.py
cat > Dockerfile <<'EOF'
FROM python:3.13-slim
WORKDIR /app
COPY . .
RUN rm -f /app/.env
CMD ["python", "app.py"]
EOF
docker build -q -t leak-demo .
docker run --rm leak-demo ls -a /app          # .  ..  Dockerfile  app.py   (no .env)`),
        p("The running container cannot see the file. Now look at the image the way anyone who pulls it can:"),
        code("bash", `
docker history leak-demo                       # one line per layer; COPY . . is still there
docker save leak-demo -o leak-demo.tar
mkdir unpacked && tar -xf leak-demo.tar -C unpacked
# Recent Docker versions save an OCI layout: every layer is a tar file in blobs/sha256/
for blob in unpacked/blobs/sha256/*; do
  tar -tf "$blob" 2>/dev/null | grep -q '^app/.env$' && tar -xOf "$blob" app/.env
done
# DB_PASSWORD=not-a-real-password`),
        p("The password comes straight back. (The layout inside the saved tar has changed between Docker versions; if `blobs/` is missing, look for `layer.tar` files instead.)"),

        h2("3. Why deleting a file does not remove it"),
        p("Lesson 3 showed that an image is a stack of read-only layers. Each layer is a tar archive of the **changes** one instruction made. That has a consequence people forget:"),
        bullets([
            "**Layers only add.** `RUN rm -f /app/.env` cannot edit the COPY layer below it. It creates a new layer that contains a marker, a **whiteout** file named `app/.wh..env`, which means \"hide this path\".",
            "**The container sees the merged view.** When the layers are stacked, the whiteout hides `.env`, so `ls` shows nothing.",
            "**The image still ships every layer.** `docker pull` downloads the COPY layer with the file inside, and `docker save`, a registry API or any scanner can read it.",
        ]),
        p("The same is true for a file that a later layer **replaces**: `COPY config.prod.env /app/config.env` hides the older `config.env`, but the older one is still inside its own layer. And it is true for `ENV` and `ARG` values, which lesson 4 showed in `docker history` and `docker inspect`."),
        callout("warning", "A leaked secret is leaked",
            "Once an image with a secret has been pushed, assume someone has it: every runner, laptop and server that pulled it has a copy, and registry caches keep layers too. Deleting the tag does not bring the secret back. Rotate it first, then clean up."),

        h2("4. An SBOM: the list of what is inside"),
        p("A **Software Bill of Materials (SBOM)** is a list of every software component in an artifact: name, version, where it was found, a package URL (purl) such as `pkg:pypi/pyyaml@5.3.1`, and often the license. Think of the ingredient list on a food package. With an SBOM per image, \"are we affected by the PyYAML advisory?\" becomes a search instead of a meeting."),
        p("Two formats are common, both JSON (and both have other encodings):"),
        bullets([
            "**SPDX** (from the Linux Foundation), strong on licenses and files.",
            "**CycloneDX** (from OWASP), strong on components and vulnerabilities.",
        ]),
        p("Most tools read and write both, so pick one for your team and stay with it. Generating one takes a single command. Syft and Trivy are two widely used open-source tools; their flags change between versions, so check the current docs:"),
        code("bash", `
# Syft: write a CycloneDX (or SPDX) SBOM of an image
syft ghcr.io/ricerocket/api:v2.10.0 -o cyclonedx-json > api-v2.10.0.cdx.json
syft ghcr.io/ricerocket/api:v2.10.0 -o spdx-json      > api-v2.10.0.spdx.json

# Trivy: the same idea, then check the SBOM against known vulnerabilities
trivy image --format cyclonedx --output api-v2.10.0.cdx.json ghcr.io/ricerocket/api:v2.10.0
trivy sbom api-v2.10.0.cdx.json

# BuildKit can attach an SBOM to the image when it builds it
docker buildx build --sbom=true -t ghcr.io/ricerocket/api:v2.10.0 --push .`),
        h3("Why scan the image and not requirements.txt"),
        p("`requirements.txt` describes one environment that you wrote down. The image contains everything that ended up in it: the base image's OS packages, tools installed by other `RUN` lines, a second virtualenv, a binary someone copied in. The scanner reads the image's filesystem, finds package metadata (such as the `.dist-info` folders pip writes) and lists what it finds:"),
        code("text", `
name     version   purl                     found in
pyyaml   6.0.2     pkg:pypi/pyyaml@6.0.2    /app/.venv/lib/python3.13/site-packages/PyYAML-6.0.2.dist-info
pyyaml   5.3.1     pkg:pypi/pyyaml@5.3.1    /opt/migrate/venv/lib/python3.13/site-packages/PyYAML-5.3.1.dist-info
openssl  3.0.15    pkg:deb/debian/openssl   /var/lib/dpkg/status`, "SBOM excerpt, api v2.10.0"),
        h3("What an SBOM cannot tell you"),
        bullets([
            "**It only lists what the tool can recognise.** A binary copied in with `COPY`, without package metadata, may be missing. An empty result for a package is not proof that it is absent.",
            "**It is a snapshot.** It describes one image digest. Generate it in CI for every image you push, and store it next to the image.",
            "**Listed is not exploitable.** A vulnerable library that is never called is lower risk than one on the request path. The SBOM tells you where to look; it does not decide for you.",
        ]),

        h2("5. A worked example: diff two SBOMs"),
        p("Comparing the SBOM of a release with the one before it shows every package that was added, removed or changed - a short list that a reviewer can actually read. With CycloneDX JSON and the standard library:"),
        code("python", `
import json
import sys


def packages(path):
    """{name: set of versions} from a CycloneDX JSON SBOM."""
    with open(path) as f:
        sbom = json.load(f)
    found = {}
    for component in sbom.get("components", []):
        found.setdefault(component["name"].lower(), set()).add(component.get("version", "?"))
    return found


old, new = packages(sys.argv[1]), packages(sys.argv[2])
for name in sorted(old.keys() | new.keys()):
    before, after = old.get(name, set()), new.get(name, set())
    if not before:
        print(f"+ {name} {', '.join(sorted(after))}")
    elif not after:
        print(f"- {name} {', '.join(sorted(before))}")
    elif before != after:
        print(f"~ {name} {', '.join(sorted(before))} -> {', '.join(sorted(after))}")`, "sbom_diff.py"),
        code("bash", `
python sbom_diff.py api-v2.9.0.cdx.json api-v2.10.0.cdx.json
# + alembic 1.13.2
# ~ psycopg 3.2.1 -> 3.2.3
# ~ pyyaml 6.0.2 -> 5.3.1, 6.0.2`),
        p("The last line is the one the api team missed: a second PyYAML arrived with the migration tool in v2.10.0. A diff like this in the pull request or the CI summary makes such changes visible when they happen, not when an advisory arrives."),

        h2("6. Secret scanning, layer by layer"),
        p("A **secret scanner** reads text and reports anything that looks like a credential: cloud keys with a known shape (AWS access key ids start with `AKIA`), private key headers, and `NAME=value` lines whose name says PASSWORD, SECRET or TOKEN. For an image, a good scanner reads **every layer**, not only the final filesystem, for the reason in section 3."),
        code("bash", `
trivy image --scanners secret ghcr.io/ricerocket/api:v2.9.0
# app/.env (secrets)
# HIGH: database password ... Layer: COPY . . (sha256:91c2...)

gitleaks git .        # scan the repository history before anything is built`),
        bullets([
            "**Scan twice.** Scan the repository (gitleaks, or your Git host's secret scanning) so secrets never get committed, and scan the image after the build and **before the push**, failing the pipeline on a finding.",
            "**Expect false positives.** `PASSWORD_MIN_LENGTH=12` looks like a password. Keep a small, reviewed allowlist instead of turning the scanner off.",
            "**Expect false negatives.** A password called `DB_PASS` or a token without a known shape slips through pattern rules. A clean scan lowers the risk; it does not prove there is no secret.",
            "**Never print the secret.** A scanner report goes to CI logs and chat. Report the file, layer and line; the person who fixes it can look at the file.",
        ]),

        h2("7. Fix the incident, then verify"),
        numbered([
            "**Rotate the password first.** Change it in the database and the secret store, and restart production with the new value. Until then, everyone who pulled v2.9.0 can log in.",
            "**Keep secrets out of the build context.** Add `.env` and `*.env` to `.dockerignore`, so `COPY . .` cannot pick them up. If the build itself needs a secret, use a BuildKit secret mount (`RUN --mount=type=secret,...`, lesson 4), which is never stored in a layer.",
            "**Rebuild and remove the old images** from the registry, and ask everyone who pulled them to delete their copies. This limits the damage; it does not undo it, which is why step 1 comes first.",
            "**Upgrade or remove the old PyYAML**: update the migration tool, or move it to its own image so it is not in the api runtime image at all.",
            "**Add both scans to CI**: an SBOM for every pushed image, stored next to it, and a secret scan that fails the build.",
        ]),
        p("Verify each step with evidence, not with a feeling:"),
        bullets([
            "The old password fails: `psql \"postgres://api:Pr0d-Rice-2026@db.internal/api\" -c 'select 1'` is rejected.",
            "The new image has no finding: `trivy image --scanners secret` reports nothing, and `docker history` shows no `rm` of a file that should never have been copied.",
            "The SBOM of the new image lists one PyYAML, 6.0.2, and the vulnerability check against the SBOM is clean for this advisory.",
            "On purpose, put a fake `.env` with `DB_PASSWORD=test-not-real` in a branch and push: the pipeline must fail at the secret scan. A check you have never seen fail is not yet a check.",
        ]),

        h2("8. Your turn"),
        p("First, two pieces of evidence from Rice Rocket's images: a Dockerfile that deletes a file, and an SBOM checked against the advisory."),
        challenge("chal_quiz_devf_231"),
        p("Now write the scanner. `scan_image(layers)` gets the layers of an image in build order and reports every secret in every layer, including the ones that a later layer deleted or replaced - with the layer, the path and the line, but never the secret itself."),
        challenge("chal_coding_devf_232"),

        h2("9. Common mistakes"),
        bullets([
            "**Deleting a secret in a later layer.** Spot it: `docker history` shows a `RUN rm` of a file that a `COPY` added. Keep the file out with `.dockerignore`, and rotate it if it was ever pushed.",
            "**Answering advisories from `requirements.txt`.** Spot it: nobody can show the SBOM of the image that runs in production. Generate one per image digest in CI.",
            "**Scanning only the final filesystem.** Spot it: the scanner runs `docker run ... find /` or similar. Use a tool that reads every layer.",
            "**Treating a clean scan as proof.** Spot it: the checklist says \"scanner green, so no secrets\". Pattern rules miss secrets with unusual names; reviews and `.dockerignore` still matter.",
            "**Printing secrets in scan reports.** Spot it: the CI log of the scan contains the value. Report the location, mask the value.",
        ]),

        h2("10. Summary"),
        bullets([
            "**An image is every layer, not what `ls` shows.** Deleting or replacing a file in a later layer hides it from the container, but the older layer still ships it. Keep secrets out of the build context, and rotate any secret that was pushed.",
            "**An SBOM lists what you shipped, not what you wrote.** Generate one (SPDX or CycloneDX, with tools such as Syft or Trivy) for every image in CI, diff it between releases, and check advisories against it.",
            "**Scan every layer before the push, and verify the scan by making it fail** with a fake secret. A clean result lowers the risk; it is not a proof.",
        ]),
    ],
});
