// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-4-2",
    title: "Verify artifacts against signed digests",
    slug: { _type: "slug", current: "verify-artifacts-signed-digests" },
    description:
        "Production ran a web bundle that staging never tested: the deploy job downloaded it by name from a bucket that a pull-request workflow could also write to. Learn what a digest proves and what it does not, why a tag is not a version, what exactly gets signed (a canonical manifest), why the signature must be checked first and compared in constant time, how to reject unsigned extras and tag references, and where Sigstore/cosign and SLSA provenance fit.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "On Thursday a learner reports that the lesson player at https://app.codedev.test loads a script from cdn-analytics.test, a domain CodeDev does not use. Staging, which runs the same release 2026.10.3, does not. The deploy job downloads web.tar.gz from the release bucket by file name and copies it to the CDN; the release manifest next to it lists SHA-256 digests, but nothing reads them. The bucket's access log shows that web.tar.gz was overwritten 40 minutes after the release job finished, by the service account of the preview workflow that runs on every pull request.",
    },

    content: [
        h2("1. The incident: the right name, the wrong bytes"),
        p("The deploy job was written early in the project, when the release job and the deploy job were the only things that touched the bucket:"),
        code("bash", `
# deploy-web.sh (the version that ran)
gsutil cp "gs://codedev-releases/$RELEASE/web.tar.gz" .
tar -xzf web.tar.gz -C dist/
gsutil -m rsync -r dist/ gs://codedev-cdn/app/`, "deploy-web.sh"),
        p("Months later a preview workflow was added, so that every pull request gets a preview URL. To save time it was given the same service account as the release job. The bucket's access log tells the rest:"),
        code("text", `
2026-10-23T08:02:11Z  release-job@codedev-ci   WRITE  codedev-releases/2026.10.3/web.tar.gz        size=4.1MB
2026-10-23T08:02:12Z  release-job@codedev-ci   WRITE  codedev-releases/2026.10.3/release-manifest.json
2026-10-23T08:43:57Z  release-job@codedev-ci   WRITE  codedev-releases/2026.10.3/web.tar.gz        size=4.1MB
                      (workflow: preview, ref: refs/pull/1902/merge)
2026-10-23T09:10:30Z  deploy-job@codedev-ci    READ   codedev-releases/2026.10.3/web.tar.gz`, "bucket access log"),
        p("Pull request 1902 came from a fork. Its preview build wrote its own `web.tar.gz` to the path of the real release, by mistake or not. The deploy job asked for \"the file called web.tar.gz in folder 2026.10.3\" and got it. Nothing in the pipeline asked the only question that matters: **are these the bytes the release job built?**"),

        h2("2. Reproduce it and read the evidence"),
        p("Compare the bytes, not the names. The manifest written by the release job still has the original digest, so the mismatch shows up in one command:"),
        code("bash", `
$ jq -r '.digests["web.tar.gz"]' release-manifest.json
7d5e0c9a41f2...b0e4
$ sha256sum web.tar.gz
c41a9be20f6d...91aa  web.tar.gz`, "terminal"),
        p("The same check works for container images, where the problem is the tag. A tag such as `api:2026.10.3` is a movable name: anyone who can push to the repository can point it at a new image, and each `kubectl set image` resolves it again. The digest a pod actually runs is in its status:"),
        code("bash", `
$ kubectl get pod -n production -l app=api \\
    -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'
registry.codedev.test/api@sha256:9b07e1...c2a4

# what the tag points to right now (crane is one of several tools that can do this)
$ crane digest registry.codedev.test/api:2026.10.3
sha256:9b07e1...c2a4`, "terminal"),

        h2("3. Core idea: digests say what, signatures say who"),
        h3("A digest names the bytes"),
        p("A SHA-256 digest is a 32-byte fingerprint of the content. Change one bit and the digest changes; nobody can practically build different content with the same digest. That makes a digest a **name that cannot be moved**: `api@sha256:9b07e1...` always means the same image, while `api:2026.10.3` means whatever was pushed last. Deploy by digest, and record the digest that was tested."),
        p("But a digest proves only that the file matches a digest written somewhere. If the attacker can replace the file, they can usually replace the manifest that sits next to it in the same bucket. The digest list itself has to be protected."),
        h3("A signature says who wrote the digests"),
        p("The release job signs the manifest; the deploy job verifies the signature with a key the preview workflow cannot use. Now replacing `web.tar.gz` and editing its digest is not enough: the signature no longer matches, and without the signing key it cannot be made to match. The order of the checks follows from that: **verify the signature first, and only then trust any digest in the manifest**. A gate that compares digests first, or skips the signature when the field is missing, can be passed by deleting the signature."),
        h3("Sign exact bytes: a canonical form"),
        p("A signature covers bytes, not meaning. `JSON.stringify` of an object is not a stable byte sequence: key order follows insertion order, spacing depends on the writer, and two tools can serialize the same manifest differently. The signer and the verifier must build **exactly the same string** from the manifest. The usual answer is a small canonical form, for example:"),
        code("text", `
codedev-manifest-v1
release:2026.10.3
api.tar.gz sha256:b0b487ba...6bd0
web.tar.gz sha256:e60232b3...10da
`, "canonical manifest (sorted by name, one line per artifact, a newline after every line)"),
        p("A canonical form needs rules that make it unambiguous: a version prefix, a fixed order, lowercase hex, and **names that cannot contain the separators**. If a name could contain a space or a newline, an attacker could write an entry whose name looks like the end of one line and the start of another, and two different manifests would produce the same signed string. Reject such names instead of escaping them."),
        h3("Compare MACs in constant time"),
        p("`a === b` on two strings stops at the first different character, so it takes slightly longer the more leading characters match. Against a secret-keyed MAC, an attacker who can measure that time over many attempts can learn a valid value byte by byte. `crypto.timingSafeEqual` compares two buffers in time that does not depend on where they differ. It throws when the lengths differ, so validate the format first. Here is the pattern on a different problem, a webhook signature:"),
        code("typescript", `
import { createHmac, timingSafeEqual } from "node:crypto";

// Header: "X-Signature: sha256=<64 hex>" over the raw request body.
function webhookValid(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  const hex = header?.startsWith("sha256=") ? header.slice(7) : "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;        // also guarantees 32 bytes below
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(hex, "hex"));
}`, "webhook.ts"),
        callout("warning", "HMAC in this lesson, real signatures in production",
            "The challenge simulates the signature with HMAC-SHA256 and a test key so it runs without network or key infrastructure. HMAC is symmetric: whoever can verify can also sign, so in a real pipeline the deploy job would hold the release job's signing power. Production setups use asymmetric signatures: a key in a KMS, or Sigstore's cosign, which can sign with a short-lived certificate tied to the CI workflow's identity and records signatures in a public transparency log. Typical commands are `cosign sign <image>@sha256:...` in the release job and `cosign verify` with the expected identity and OIDC issuer in the deploy job; check the cosign documentation for the flags of your version. The checks around the signature in this lesson stay the same."),
        h3("Beyond \"who signed\": provenance"),
        p("A signature proves that a key holder vouched for the digests. **SLSA provenance** goes one step further: a signed statement of how the artifact was built (which builder, which source repository and commit, which workflow), so the deploy side can require \"built by our release workflow from the main branch\" and not just \"signed by someone with the key\". On npm, packages published from supported CI systems can carry provenance, and recent npm versions check registry signatures and provenance attestations of installed packages with `npm audit signatures`. What each tool verifies changes between versions; read its documentation before you rely on it."),
        callout("info", "When signing does not help",
            "A signature proves who vouched for the bytes, not that the bytes are safe: a compromised build that signs its own output is still signed. It also protects nothing if the signing key is reachable from jobs that run untrusted code, such as builds of pull requests from forks. Keep signing in a job that only runs on protected branches, give pull-request workflows their own credentials with no write access to release storage (lesson 3.3), and never sign at deploy time what you did not build."),
        challenge("chal_quiz_ssc_421"),

        h2("4. Worked example: the deploy gate"),
        p("The new deploy job runs a gate before anything is copied to the CDN or the cluster. In the order it runs:"),
        numbered([
            "**Build the canonical manifest.** If it cannot be built (empty release, a name with a space or a newline, a digest that is not 64 hex characters), reject: a manifest the signer could not have produced is not worth reading further.",
            "**Verify the signature.** Wrong format, wrong length or wrong value: reject with \"bad signature\" and stop. Do not report digest mismatches next to it; they come from a manifest you cannot trust.",
            "**Check the release.** The request must deploy the release the manifest was signed for. Otherwise an old, correctly signed manifest could be replayed with old, vulnerable artifacts.",
            "**Check every artifact in the bundle,** not only the ones being deployed: two files with the same name (which one gets deployed?), a file the manifest does not list (unsigned extras such as a `postinstall.sh` have no business in a release bundle), and a file whose digest does not match.",
            "**Check every reference to deploy.** A tag reference is rejected: the gate cannot know which bytes it will resolve to. A digest reference must name an artifact in the manifest, carry the signed digest, and the artifact must actually be there.",
            "**Decide.** No reason: deploy exactly the signed digests. Any reason: reject, with every reason listed, sorted, so the same input always gives the same report and two runs can be compared.",
        ]),
        p("The deploy itself then refers to digests only:"),
        code("yaml", `
# deploy job (excerpt)
  - name: Verify the release
    id: verify                                  # writes api_digest to $GITHUB_OUTPUT on success
    run: node scripts/verify-release.mjs --manifest release-manifest.json --bundle dist/ --request deploy-request.json
  - name: Roll out the verified digest
    run: kubectl set image deploy/api api=registry.codedev.test/api@\${{ steps.verify.outputs.api_digest }}`, "deploy.yml"),
        p("For the incident, the gate rejects the release with a digest mismatch on `web.tar.gz` and the CDN keeps serving the previous version. The other fix is permissions: the preview workflow gets its own service account with no write access to `codedev-releases`, and the bucket gets object versioning so an overwrite cannot erase the original."),

        h2("5. How to verify the gate"),
        bullets([
            "**Tamper on purpose.** In a test environment, change one byte of an artifact after signing: the gate must reject with a digest mismatch. Edit the digest in the manifest too: it must now reject with a bad signature instead.",
            "**Remove the signature field.** A gate that treats a missing signature as \"nothing to check\" passes the attack in section 3. The test must expect a rejection.",
            "**Feed it malformed signatures.** Too short, not hex, uppercase hex. The gate must reject or accept cleanly and never crash; a crash in a deploy script is often caught by a retry that skips the step.",
            "**Re-sign with the canonical form from a second implementation.** If a shell or Python script that signs per the documented format produces signatures your gate accepts, the format is really specified and not just \"whatever our code does\".",
            "**Check what runs.** After the deploy, compare the `imageID` of the pods and the CDN file digests with the signed manifest.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Trusting digests from an unverified manifest.** Spot it: the digest loop runs before the signature check, or the signature check is inside `if (manifest.signature)`.",
            "**Signing a serialization instead of a canonical form.** Spot it: `JSON.stringify(manifest)` on the signing side, and verification that fails after someone reformats the file.",
            "**Comparing a MAC with `===`, or calling `timingSafeEqual` on unchecked input.** Spot it: string equality on signatures, or a `RangeError` in the deploy log when a signature is truncated.",
            "**Checking only what is being deployed.** Spot it: extra files in the bundle never cause a failure. Unsigned extras are how payloads ride along with a valid release.",
            "**Deploying by tag after verifying by digest.** Spot it: the gate checks `api@sha256:...` but the rollout says `api:2026.10.3`, which can point somewhere else a second later.",
        ]),
        p("In the challenge you write this gate: canonical manifest, HMAC check with a constant-time comparison, then the release, the bundle and the references, with a sorted list of reasons. Use exactly the canonical form from the challenge text; the tests include a manifest whose digests and signature are uppercase, a truncated signature, a tampered manifest and a large release."),
        challenge("chal_coding_ssc_422"),

        h2("7. Summary"),
        numbered([
            "A digest names exact bytes and a tag is a movable pointer: deploy and record digests, and compare what runs with what was signed.",
            "Sign a canonical form with unambiguous rules, verify the signature before trusting any digest, and compare MACs in constant time after checking their format.",
            "Reject unsigned extras, duplicates, tag references and replayed releases; in production use asymmetric signing (Sigstore/cosign or a KMS key) and, where available, provenance that says how the artifact was built.",
        ]),

        h2("Sources"),
        bullets([
            "SLSA specification (provenance and build levels) - slsa.dev",
            "Sigstore documentation: cosign signing and verification - docs.sigstore.dev",
            "Node.js documentation: crypto.timingSafeEqual and crypto.createHmac - nodejs.org/api/crypto.html",
            "npm documentation: npm audit signatures and provenance - docs.npmjs.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one artifact your pipeline deploys (an image, a bundle, a binary) and trace it from the build job to production. Write down every place it is referred to by a movable name (a tag, a path, \"latest\") and every identity that can write there. Then add the smallest check that closes the gap: record the digest at build time and compare it at deploy time. If your registry or CI supports signing or attestations, try signing one image and verifying it in a separate job."),
    ],
});
