// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-3-2",
    title: "Environments without copy-paste",
    slug: { _type: "slug", current: "terraform-environments-without-copy-paste" },
    description:
        "Rice Rocket's staging and production folders started as copies and drifted apart, and an attempt to merge them with terraform.workspace conditionals applied staging values to production. Learn the layout that keeps environments identical by construction - one root module, one state per environment, the differences as one settings map read by var.env, for_each keyed by name - and write the single configuration that replaces both folders.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Two copied Terraform folders, one per environment, had quietly stopped matching: production kept database backups that staging did not, and a log group added for a new service existed only in staging. The first fix, Terraform CLI workspaces with conditionals on terraform.workspace, made things worse: a plan meant for staging ran with the production workspace still selected.",
    },

    content: [
        h2("Situation"),
        p("The repository held one folder per environment, each with its own copy of the same resources:"),
        code("text", `
infra/
  staging/
    main.tf         # copied from production in March
  production/
    main.tf`, "tree"),
        code("bash", `
diff infra/staging/main.tf infra/production/main.tf
< resource "aws_cloudwatch_log_group" "courier_matcher" {
<   name              = "/rice-rocket-staging/courier-matcher"
<   retention_in_days = 7
< }
---
>   backup_retention_period = 14
>   deletion_protection     = true`, "terminal"),
        p("To stop the drift, a teammate merged the folders into one and switched environments with CLI workspaces, sprinkling conditionals through the file:"),
        code("hcl", `
resource "aws_db_instance" "main" {
  identifier              = "rice-rocket-\${terraform.workspace}"
  instance_class          = terraform.workspace == "production" ? "db.t4g.medium" : "db.t4g.micro"
  backup_retention_period = terraform.workspace == "production" ? 14 : 3
  deletion_protection     = terraform.workspace == "production"
  # ... nine more conditionals in other resources
}`, "infra/main.tf"),
        bullets([
            "The CI job never ran `terraform workspace select`, so every CI plan ran in the `default` workspace and planned a database named `rice-rocket-default`.",
            "On a laptop, `terraform workspace show` still said `production` from the day before when an engineer applied what they believed was a staging change.",
            "Every new difference between the environments meant one more conditional somewhere in the file, and nobody could list all the differences in one place.",
        ]),

        h2("The core you need"),
        bullets([
            "**One root module, one state per environment.** The same `.tf` files plan every environment; each environment keeps its own state, selected by the backend key at `terraform init` (`-backend-config=...`) or by a small per-environment folder that only sets the backend and calls the shared code. The state is what keeps environments apart, not copies of the code.",
            "**Differences are data.** Put everything that differs (sizes, retention, protection flags) in one map keyed by environment, `local.settings`, or in one `environments/<env>.tfvars` file per environment. Reading the file, you see every difference side by side.",
            "**One lookup, one input.** `local.current = local.settings[var.env]` picks the environment's settings once; resources read `local.current.instance_class`. A missing key fails the plan of that environment at once, instead of quietly taking another environment's value.",
            "**`var.env`, not `terraform.workspace`.** `terraform.workspace` is whatever workspace the machine running the plan has selected, which CI and laptops do not share. A required, validated variable is explicit in every command and in the CI log. HashiCorp's own documentation advises against relying on CLI workspaces alone to separate environments that need different credentials or access controls.",
            "**`for_each` keyed by name for repeated resources.** `for_each` takes a map or a set of strings (`toset(local.services)`), and each instance is addressed by its key: `aws_cloudwatch_log_group.service[\"api\"]`. Adding or removing one service touches only that instance, unlike `count`, whose index shifts.",
        ]),

        h2("Apply it in the project"),
        p("The two folders become one configuration plus one small backend file per environment:"),
        code("text", `
infra/
  main.tf                       # everything below
  backend.tf                    # backend "s3" { bucket, region, use_lockfile } - no key
  environments/
    staging.backend.hcl         # key = "staging/terraform.tfstate"
    production.backend.hcl      # key = "production/terraform.tfstate"`, "tree"),
        code("hcl", `
variable "env" {
  type        = string
  description = "Environment name: staging or production."
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env must be staging or production."
  }
}

locals {
  settings = {
    staging = {
      instance_class          = "db.t4g.micro"
      backup_retention_period = 3
      deletion_protection     = false
      log_retention_days      = 7
    }
    production = {
      instance_class          = "db.t4g.medium"
      backup_retention_period = 14
      deletion_protection     = true
      log_retention_days      = 30
    }
  }
  current  = local.settings[var.env]
  name     = "rice-rocket-\${var.env}"
  services = ["api", "courier-matcher", "notifications"]
}

resource "aws_db_instance" "main" {
  identifier              = local.name
  engine                  = "postgres"
  engine_version          = "17"
  instance_class          = local.current.instance_class
  allocated_storage       = 20
  username                = "rocket"
  password                = var.db_password
  backup_retention_period = local.current.backup_retention_period
  deletion_protection     = local.current.deletion_protection
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(local.services)
  name              = "/\${local.name}/\${each.key}"
  retention_in_days = local.current.log_retention_days
}`, "infra/main.tf"),
        p("CI derives the backend file and the variable from one value, so the state and the settings always belong to the same environment:"),
        code("bash", `
ENV=production
terraform init -reconfigure -backend-config="environments/$ENV.backend.hcl"
terraform plan -input=false -var "env=$ENV" -out="$ENV.tfplan"`, "ci/plan.sh"),
        callout("info", "Existing objects keep their addresses",
            "The production folder's resources already have state at the same addresses (`aws_db_instance.main`). Moving to the shared code is a plan with no changes once the code matches; where an address changes (a log group that becomes `service[\"api\"]`), a `moved` block from lesson 5 renames it instead of replacing it."),

        h2("Verify"),
        code("bash", `
ENV=production ./ci/plan.sh
# No changes. Your infrastructure matches the configuration.

ENV=staging ./ci/plan.sh
#   ~ resource "aws_db_instance" "main" {
#       ~ backup_retention_period = 0 -> 3
#     }
#   + resource "aws_cloudwatch_log_group" "service" ["notifications"] { ... }
# Plan: 1 to add, 1 to change, 0 to destroy.

terraform plan -input=false -var "env=prod"
# Error: Invalid value for variable ... env must be staging or production.`, "terminal"),
        p("The staging plan shows the old drift being closed: backups turned on and the missing log group created. Review it like any other change before applying."),

        h2("Pitfalls"),
        bullets([
            "**The variable and the backend disagree.** Planning `-var env=production` against the staging state wants to replace the staging database (its `identifier` changes) and create production's log groups. Detect it in the plan: replacements of objects you did not touch. Derive both from one value in CI, as `ci/plan.sh` does.",
            "**`count` over a list of services.** Removing `courier-matcher` from the middle of the list shifts `notifications` from index 2 to 1, and the plan destroys and recreates log groups you did not change. Use `for_each` with names as keys.",
            "**A difference added for one environment only.** A new key in `settings.production` alone fails only the staging plan, maybe weeks later. Plan every environment on every pull request so the error shows up in the review that caused it.",
        ]),

        p("Now write the single configuration. The editor starts from `infra/main.tf` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the copied folders' and the workspace attempt's mistakes on purpose. Run plans the file for staging and production from CI and from a laptop on the wrong workspace, then plans production against its current state."),
        challenge("chal_coding_tf_162"),
    ],
});
