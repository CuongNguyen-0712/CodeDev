// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-2-2",
    title: "Modules with clear inputs",
    slug: { _type: "slug", current: "terraform-modules-clear-inputs" },
    description:
        "Rice Rocket's web and admin site buckets were copy-pasted resource blocks that drifted apart, and the first module that replaced them took `type = any`, so a typo left a bucket public. Learn what a module is, how typed inputs with optional defaults, validation and narrow outputs make it safe to call, and why a reusable module configures no provider, then write the static-site module.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The static web site and the admin site each have an S3 bucket with versioning and a public access block. The blocks were copied, a fix to the web bucket never reached the admin bucket, and the first attempt at a shared module made things worse: a misspelled option was silently ignored and the admin bucket was planned without its public access block.",
    },

    content: [
        h2("Situation"),
        p("The first module took one loosely typed map and looked its keys up with defaults:"),
        code("hcl", `
# modules/static-site/main.tf (first version)
variable "config" {
  type = any
}

resource "aws_s3_bucket_public_access_block" "this" {
  count  = lookup(var.config, "block_public_access", false) ? 1 : 0
  bucket = aws_s3_bucket.this.id
  # ...
}

# infra/sites.tf
module "admin" {
  source = "./modules/static-site"
  config = {
    name                = "admin"
    block_public_acess  = true    # typo
  }
}`, "two files"),
        code("text", `
$ terraform plan
  # module.admin.aws_s3_bucket.this will be created
  # module.admin.aws_s3_bucket_versioning.this[0] will be created
Plan: 2 to add, 0 to change, 0 to destroy.`, "terminal"),
        bullets([
            "No error, no warning: `block_public_acess` is just another key of an `any` map, and `lookup` fell back to `false`.",
            "The unsafe value was the default, so forgetting the option and misspelling it looked the same.",
            "The module also had its own `provider \"aws\"` block, which pinned every caller to one region.",
        ]),

        h2("The core you need"),
        bullets([
            "**A module is a folder of .tf files.** Its `variable` blocks are its inputs, its resources are created once per call, and its `output` blocks are all a caller can read (`module.admin.bucket_arn`). Resource addresses get a prefix: `module.admin.aws_s3_bucket.this`.",
            "**Type the inputs.** `object({ versioning = optional(bool, true) })` checks every value a caller passes: a string where a bool belongs fails the plan. `optional(type, default)` lets a caller leave an attribute out and get the default.",
            "**Make the default the safe choice.** Terraform drops attributes that an object type does not declare, typed or not, so a misspelled key is still ignored. What changes is what happens next: with `block_public_access = optional(bool, true)` an ignored typo leaves the bucket protected.",
            "**Validate what types cannot express.** A `validation` block (`condition` + `error_message`) on `name` rejects capitals or spaces with a message the caller understands, before any API call.",
            "**Output values, not whole resources.** `value = aws_s3_bucket.this.arn` is a contract; `value = aws_s3_bucket.this` hands callers every attribute, and they start depending on internals you cannot change later.",
            "**Leave providers to the caller.** A reusable module declares `required_providers` at most, never a `provider` block: the root module decides region and credentials, and passes them in (or a `providers = { aws = aws.singapore }` map).",
            "**Pin versions of shared modules.** A registry module takes `version = \"~> 2.1\"`; a git module takes `?ref=v2.1.0` in its `source`. Local `./modules/...` paths are versioned with the repository.",
        ]),

        h2("Apply it in the project"),
        p("The module keeps a validated `name`, a typed `options` object with safe defaults, and two outputs:"),
        code("hcl", `
variable "env" {
  type = string
}

variable "name" {
  type = string
  validation {
    condition     = length(var.name) > 0 && length(var.name) <= 20 && lower(var.name) == var.name && length(split(" ", var.name)) == 1
    error_message = "name must be 1-20 lowercase characters without spaces."
  }
}

variable "options" {
  type = object({
    versioning          = optional(bool, true)
    block_public_access = optional(bool, true)
  })
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_s3_bucket" "this" {
  bucket = "rice-rocket-\${var.env}-\${var.name}"
  tags   = merge(var.tags, { Site = var.name })
}

resource "aws_s3_bucket_public_access_block" "this" {
  count                   = var.options.block_public_access ? 1 : 0
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "this" {
  count  = var.options.versioning ? 1 : 0
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}

output "bucket" {
  value = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}`, "modules/static-site/main.tf"),
        p("The root module calls it once per site and owns the provider:"),
        code("hcl", `
provider "aws" {
  region = "ap-southeast-1"
}

module "web" {
  source  = "./modules/static-site"
  env     = var.env
  name    = "web"
  options = { versioning = true }
  tags    = local.tags
}

module "admin" {
  source = "./modules/static-site"
  env    = var.env
  name   = "admin"
  tags   = local.tags
}

output "web_bucket_arn" {
  value = module.web.bucket_arn
}`, "infra/sites.tf"),
        callout("info", "One file or three",
            "Modules usually split into `variables.tf`, `main.tf` and `outputs.tf`. Terraform reads every .tf file of the folder as one configuration, so the split is only for people; the challenge keeps them in one file."),

        h2("Verify"),
        code("bash", `
terraform init          # installs the local module next to the providers
terraform validate
# Success! The configuration is valid.
terraform plan -var env=staging
#   # module.admin.aws_s3_bucket.this will be created
#   # module.admin.aws_s3_bucket_public_access_block.this[0] will be created
#   # module.admin.aws_s3_bucket_versioning.this[0] will be created
#   # module.web.aws_s3_bucket.this will be created
#   ...
# Plan: 6 to add, 0 to change, 0 to destroy.
grep -rn 'provider "' modules/   # no output: the module configures no provider`, "terminal"),
        p("Try a wrong type on purpose (`options = { versioning = \"yes\" }`): the plan stops on that call with an invalid value error for `versioning` before anything is created."),

        h2("Pitfalls"),
        bullets([
            "**Unsafe defaults.** A typo or a missing option falls back to the default, so a default of `false` for a protection is a hole. Read every `optional(...)` default and ask what happens when a caller forgets it.",
            "**Moving existing resources into a module.** The addresses change (`aws_s3_bucket.web` becomes `module.web.aws_s3_bucket.this`) and the plan shows destroy and create. Add `moved` blocks before applying; lesson 5 covers them.",
            "**Outputs that leak internals.** A whole-resource output lets callers read anything; renaming an attribute inside the module then breaks them. Grep callers for `module.<name>.` before changing an output.",
        ]),

        p("Now write the module. The editor starts from `modules/static-site/main.tf` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first module's mistakes on purpose. Run plans a root module that calls yours for the web and admin sites, then tries a wrong type, a bad name and a site without versioning."),
        challenge("chal_coding_tf_142"),
    ],
});
