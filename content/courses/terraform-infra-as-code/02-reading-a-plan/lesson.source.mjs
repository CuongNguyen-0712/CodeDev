// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-1-2",
    title: "Reading a plan before you apply it",
    slug: { _type: "slug", current: "terraform-reading-a-plan" },
    description:
        "A reviewer approved a plan that replaced Rice Rocket's staging database because the change \"was just a name\", and every plan for production kept trying to shrink storage that RDS had grown. Learn to read a plan - its symbols, forced replacements, unknown values and summary line - and guard the database with lifecycle rules so the dangerous plans stop on their own.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The managed PostgreSQL of each environment is now in Terraform, and CI posts `terraform plan` on every pull request. Two plans in one week went wrong: one would have replaced the staging database, and production's plan showed a change nobody had made.",
    },

    content: [
        h2("Situation"),
        p("A pull request titled \"rename the database to our naming convention\" changed one line, `identifier = \"rr-staging-db\"` to `identifier = local.name`. CI posted this plan, a reviewer approved it, and the apply ran:"),
        code("text", `
  # aws_db_instance.main must be replaced
-/+ resource "aws_db_instance" "main" {
      ~ address    = "rr-staging-db.c9x2k1.ap-southeast-1.rds.amazonaws.com" -> (known after apply)
      ~ endpoint   = "rr-staging-db.c9x2k1.ap-southeast-1.rds.amazonaws.com:5432" -> (known after apply)
      ~ id         = "db-STAGING7Q2" -> (known after apply)
      ~ identifier = "rr-staging-db" -> "rice-rocket-staging" # forces replacement
        # (11 unchanged attributes hidden)
    }

Plan: 1 to add, 0 to change, 1 to destroy.`, "terraform plan"),
        p("The apply stopped only because the instance had deletion protection turned on in the console: AWS refused the delete. In production, RDS storage autoscaling had grown the disk from 20 to 32 GiB, and every plan since showed `~ allocated_storage = 32 -> 20`, a change that fails on every apply because RDS storage cannot shrink."),

        h2("The core you need"),
        bullets([
            "**A plan is a list of API calls.** Terraform refreshes each object in state from the cloud, compares it with the configuration, and proposes actions. Nothing changes until apply; then each action is a real create, update or delete call.",
            "**Read the symbol first.** `+` create, `~` update in place, `-` destroy, `-/+` destroy then create (replace), `+/-` create the new one first, then destroy the old (`create_before_destroy`), `<=` read a data source.",
            "**`# forces replacement` names the cause.** Some attributes cannot change through the API (`identifier`, `engine` and `username` of an RDS instance, `bucket` of an S3 bucket); changing one replaces the object. For a database, replaced means empty.",
            "**`(known after apply)` is not an error.** Values the provider assigns (`id`, `arn`, `endpoint`) are unknown until the object exists. On a replace, they become unknown again: that is another sign the object will be new.",
            "**The summary line is the gate.** `Plan: X to add, Y to change, Z to destroy.` A non-zero destroy on a stateful resource needs a second look, every time.",
            "**`lifecycle` encodes what reviewers must not miss.** `prevent_destroy = true` turns any plan that destroys or replaces the object into an error. `ignore_changes = [allocated_storage]` leaves an attribute to whoever manages it after creation (here RDS autoscaling). `create_before_destroy` flips the order of a replace for objects that can exist twice.",
            "**Saved plans.** `terraform plan -out tfplan` writes the plan; `terraform apply tfplan` runs exactly that and refuses it if the state changed since. `terraform show -json tfplan` gives CI a machine-readable list of actions to check.",
        ]),

        h2("Apply it in the project"),
        p("Write down what the team learned in the resource itself. `deletion_protection` is AWS's guard; `prevent_destroy` is Terraform's, and it fires at plan time, before anyone has to read carefully:"),
        code("hcl", `
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

locals {
  name = "rice-rocket-\${var.env}"
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"

  instance_class        = var.db_instance_class
  allocated_storage     = 20
  max_allocated_storage = 100   # RDS storage autoscaling may grow it up to here

  username                    = "rocket"
  manage_master_user_password = true   # the password lives in Secrets Manager, not in state

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "\${local.name}-final"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [allocated_storage]
  }
}`, "infra/database.tf"),
        p("Staging's instance still carries the console name `rr-staging-db`, so with this file its plan stops with an error instead of replacing it. That is the point: renaming a database is a migration (snapshot, restore under the new name, switch the app over), planned on purpose, not a one-line change. When you do want a replacement, say so explicitly: `terraform apply -replace=aws_db_instance.main`, after removing `prevent_destroy` in the same reviewed change."),
        callout("info", "A CI check on the plan, not only a human",
            "`terraform show -json tfplan` lists every resource change with its `actions` array. A small CI step that fails when any `aws_db_instance` has `delete` in its actions catches the plan even when the reviewer is in a hurry."),

        h2("Verify"),
        code("bash", `
terraform plan -var env=production -out tfplan
# aws_db_instance.main: Refreshing state... [id=db-PRODUCTION7Q2]
# No changes. Your infrastructure matches the configuration.

terraform plan -var env=production -var db_instance_class=db.t4g.medium -out tfplan
#   ~ instance_class = "db.t4g.micro" -> "db.t4g.medium"
# Plan: 0 to add, 1 to change, 0 to destroy.
terraform show -json tfplan | jq -r '.resource_changes[] | "\\(.address) \\(.change.actions | join(","))"'
# aws_db_instance.main update
terraform apply tfplan

# A plan that would replace the database now stops:
# Error: Instance cannot be destroyed
#   Resource aws_db_instance.main has lifecycle.prevent_destroy set, but the plan calls for this
#   resource to be destroyed.`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`ignore_changes` on the wrong attribute.** Adding `instance_class` \"to quiet the plan\" means a later class upgrade in code is silently ignored. Detect it when a change you made shows `No changes`; list only attributes something else owns.",
            "**Approving `-/+` because the diff looks small.** One line with `# forces replacement` is a delete. Read the summary line before the diff, and search the plan for `must be replaced`.",
            "**Applying a fresh plan instead of the reviewed one.** `terraform apply` without a plan file plans again, so what runs may differ from what was approved if main moved on. Release jobs apply the saved `tfplan`.",
        ]),

        challenge("chal_quiz_tf_121"),
        p("Now guard the database. The editor starts from `infra/database.tf` with its key lines missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces quiet the wrong plan on purpose. Run plans the file against the recorded state and the real instance, including the storage RDS grew and the old staging name."),
        challenge("chal_coding_tf_122"),
    ],
});
