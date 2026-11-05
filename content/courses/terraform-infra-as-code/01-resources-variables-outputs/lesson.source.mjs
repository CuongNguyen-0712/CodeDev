// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-1-1",
    title: "Resources, variables and outputs",
    slug: { _type: "slug", current: "terraform-resources-variables-outputs" },
    description:
        "Rice Rocket's uploads bucket and api log group were clicked together in the AWS console, once per environment, and the two copies no longer matched. Learn the parts of a Terraform configuration - providers, resources, references, variables with validation, locals and outputs - and describe both environments from one file.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api stores receipts and courier photos in an S3 bucket and writes logs to CloudWatch. Both were created by hand in staging and again in production. Production's bucket turned out to have versioning off and its logs were kept forever, staging's for a day, and nobody could say which settings were intended.",
    },

    content: [
        h2("Situation"),
        p("What `aws` reported for the two environments the week the team decided to stop clicking:"),
        code("text", `
$ aws s3api get-bucket-versioning --bucket rice-rocket-staging-uploads
{ "Status": "Enabled" }
$ aws s3api get-bucket-versioning --bucket rr-prod-uploads
{}
$ aws logs describe-log-groups --log-group-name-prefix /rice-rocket --query 'logGroups[].[logGroupName,retentionInDays]'
[["/rice-rocket-staging/api", 1], ["/rr/api-prod", null]]`, "terminal"),
        bullets([
            "Two naming schemes (`rice-rocket-staging-*`, `rr-prod-*`), so scripts guessed names per environment.",
            "Versioning on in staging, off in production: a deleted receipt in production was gone for good.",
            "Logs kept 1 day in staging (too short to debug a weekend incident) and forever in production (a growing bill).",
        ]),

        h2("The core you need"),
        bullets([
            "**Providers talk to an API.** `required_providers` pins which provider and version (`hashicorp/aws ~> 6.0`); a `provider \"aws\"` block configures it (region). `terraform init` downloads it and records the exact version in `.terraform.lock.hcl` (commit that file).",
            "**A resource is one real object.** `resource \"aws_s3_bucket\" \"uploads\" { ... }` declares a bucket; its address is `aws_s3_bucket.uploads`. Arguments you set are known at plan time; attributes the provider fills in (`id`, `arn`) show as `(known after apply)` until it exists.",
            "**References build the graph.** `bucket = aws_s3_bucket.uploads.id` makes the versioning resource depend on the bucket, so Terraform creates the bucket first and the setting always follows whichever bucket this environment has. Writing the name out by hand breaks that link.",
            "**Variables are the inputs.** `variable \"env\"` with a `type` and a `validation` block rejects bad values before anything is planned. A variable with no `default` is required: `-var`, a `.tfvars` file or `TF_VAR_env` must set it.",
            "**Locals name an expression once.** `local.name = \"rice-rocket-${var.env}\"` and one tag map keep names and tags identical everywhere; a conditional (`var.env == \"production\" ? 30 : 7`) expresses the few real differences.",
            "**Outputs are what other tools read.** `terraform output -raw uploads_bucket` gives the deploy pipeline the bucket name without guessing it.",
        ]),

        h2("Apply it in the project"),
        p("One file for both environments; the environment is an input:"),
        code("hcl", `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "ap-southeast-1"
}

variable "env" {
  type        = string
  description = "Environment name: staging or production."
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env must be staging or production."
  }
}

locals {
  name = "rice-rocket-\${var.env}"
  tags = { Project = "rice-rocket", Environment = var.env, ManagedBy = "terraform" }
}

resource "aws_s3_bucket" "uploads" {
  bucket = "\${local.name}-uploads"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/\${local.name}/api"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = local.tags
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}`, "infra/main.tf"),
        callout("info", "Existing buckets",
            "The production objects already exist under other names. This lesson creates fresh, consistently named ones; lesson 5 shows how to bring objects that already exist under Terraform with `import` blocks instead."),

        h2("Verify"),
        code("bash", `
cd infra
terraform init                      # downloads hashicorp/aws, writes .terraform.lock.hcl
terraform fmt -check && terraform validate
# Success! The configuration is valid.
terraform plan -var env=staging
#   # aws_s3_bucket.uploads will be created
#   + resource "aws_s3_bucket" "uploads" {
#       + arn    = (known after apply)
#       + bucket = "rice-rocket-staging-uploads"
#       ...
# Plan: 4 to add, 0 to change, 0 to destroy.
terraform plan -var env=prod
# Error: Invalid value for variable ... env must be staging or production.`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Names written out instead of referenced.** `bucket = \"rice-rocket-staging-uploads\"` in the versioning resource works in staging and silently configures the wrong bucket (or none) in production. Search the file for literal names that also appear as resource arguments; reference the resource.",
            "**Unpinned providers.** Without a version constraint and a committed lock file, a new major provider version arrives on the next `init` and the plan changes for no reason. Keep `~> 6.0` and commit `.terraform.lock.hcl`.",
            "**Secrets in variables and outputs.** A database password passed as a variable ends up in the state file and in plan output unless the variable and every output that uses it are marked `sensitive = true`; even then it is stored in state, which is why lesson 3 encrypts and locks down the state.",
        ]),

        challenge("chal_quiz_tf_111"),
        p("Now describe the bucket and the logs. The editor starts from `infra/main.tf` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the console era's habits on purpose. Run plans the file for staging and production, and once more over an existing staging state."),
        challenge("chal_coding_tf_112"),
    ],
});
