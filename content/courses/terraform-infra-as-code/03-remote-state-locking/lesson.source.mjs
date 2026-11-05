// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-2-1",
    title: "Remote state and locking",
    slug: { _type: "slug", current: "terraform-remote-state-locking" },
    description:
        "Rice Rocket kept terraform.tfstate in git until two applies at the same time lost a bucket from the state and a security review found the database password in the history. Learn what state holds, how an S3 backend with encryption and a lock file keeps one writer at a time, why backend blocks take no variables, and fix the backend configuration.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "A second engineer now changes infrastructure too, and CI plans every pull request. The state file that maps Terraform's resources to real AWS objects was a file in the repository, copied to every laptop.",
    },

    content: [
        h2("Situation"),
        p("Mai and Tuan each pulled main, added one resource and ran `terraform apply` within the same minute, both against `infra/terraform.tfstate` from git:"),
        code("text", `
mai:  + aws_s3_bucket.web                     Apply complete! Resources: 1 added.
tuan: + aws_cloudwatch_log_group.worker       Apply complete! Resources: 1 added.

$ git log --oneline -2 -- infra/terraform.tfstate
9f2c1d0 apply: worker log group      (tuan)
41ab7e3 apply: web bucket            (mai, merge conflict resolved with "take theirs")

$ terraform plan
  # aws_s3_bucket.web will be created
Plan: 1 to add, 0 to change, 0 to destroy.`, "terminal"),
        bullets([
            "Both applies started from the same state; Tuan's state, committed last, has no record of Mai's bucket. The bucket exists in AWS, and the next plan wants to create it again (and fails: the name is taken).",
            "A security review then grepped the history: earlier versions of the state carried the database's `password` attribute in plain text.",
        ]),

        h2("The core you need"),
        bullets([
            "**State is Terraform's memory.** It maps each resource address to the real object's id and its last known attributes, secrets included, in plain JSON. Plans compare the configuration with it; anything missing from state looks new.",
            "**A backend decides where state lives.** The `s3` backend keeps one state file per `key` in a bucket. Make that bucket versioned (to roll back a bad state write) and private; set `encrypt = true` so the object is encrypted at rest.",
            "**One writer at a time.** With locking, plan and apply take a lock on the state file and release it at the end; a second operation fails with `Error acquiring the state lock` instead of writing over the first. Recent Terraform releases can lock with a lock file in the same bucket (`use_lockfile = true`, introduced around 1.10); the older DynamoDB table locking is deprecated there. Check the release notes of the version you pin.",
            "**No variables in the backend.** Terraform configures the backend before it evaluates variables, so backend arguments are literals. Values that differ per environment (the `key`) go in a partial configuration: a `.tfbackend` file passed with `terraform init -backend-config=...`.",
            "**Pin the tool.** `required_version` refuses to run with a Terraform outside the range, before anything touches the state; an old laptop CLI cannot write a state the others no longer read.",
            "**Moving state.** `terraform init -migrate-state` copies existing local state into the new backend; `terraform force-unlock <ID>` removes a lock only when its holder is known to be dead.",
        ]),

        h2("Apply it in the project"),
        p("The state bucket is created once, by hand or from a tiny separate configuration (versioning on, public access blocked). Then the backend block holds what every environment shares, and two small files hold what differs:"),
        code("hcl", `
terraform {
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "rice-rocket-terraform-state"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}`, "infra/backend.tf"),
        code("hcl", `
# backends/staging.s3.tfbackend
key = "staging/terraform.tfstate"

# backends/production.s3.tfbackend
key = "production/terraform.tfstate"`, "infra/backends/"),
        callout("warning", "The leaked password is still leaked",
            "Moving the state out of git does not remove it from the 41 commits that hold it. Rotate the database password, and stop putting it in state at all: `manage_master_user_password = true` (lesson 2) lets RDS keep it in Secrets Manager."),

        h2("Verify"),
        code("bash", `
cd infra
terraform init -backend-config=backends/staging.s3.tfbackend -migrate-state
# Successfully configured the backend "s3"! Terraform will automatically
# use this backend unless the backend configuration changes.
aws s3 ls s3://rice-rocket-terraform-state/staging/
# 2026-11-05 07:30:12      18734 terraform.tfstate
git rm --cached terraform.tfstate && echo "*.tfstate*" >> ../.gitignore

# While Mai's apply runs, Tuan's stops at once:
terraform apply tfplan
# Error: Error acquiring the state lock
# Lock Info:
#   Path:      rice-rocket-terraform-state/staging/terraform.tfstate
#   Operation: OperationTypeApply
#   Who:       mai@mai-laptop`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**One key for every environment.** Without a per-environment `-backend-config`, staging and production share one state file and each plan wants to destroy the other's resources. Detect it with `terraform state list`: resources of both environments in one list.",
            "**Force-unlocking a live lock.** A lock that looks stuck is often a long apply. Read `Who` and `Created` in the Lock Info and ask that person (or check the CI job) before `force-unlock`.",
            "**A readable state bucket.** Anyone who can read the bucket can read every secret in every state file. Detect it with the bucket policy and IAM access analyzer; grant read to the CI role and the people who apply, nobody else.",
        ]),

        challenge("chal_quiz_tf_131"),
        p("Now fix the backend. The editor starts from `infra/backend.tf` with its key lines missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the old file's mistakes on purpose. Run simulates `terraform init` for each environment with its `.tfbackend` file, and two applies started at the same moment."),
        challenge("chal_coding_tf_132"),
    ],
});
