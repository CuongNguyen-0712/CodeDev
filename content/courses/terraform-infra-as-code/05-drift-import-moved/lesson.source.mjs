// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-tf-3-1",
    title: "Drift, imports and refactoring with moved blocks",
    slug: { _type: "slug", current: "terraform-drift-import-moved" },
    description:
        "Rice Rocket's refactoring pull request planned to destroy two buckets full of uploads, recreate a log group that already existed and undo a retention change made on purpose in the console. Learn how Terraform tells drift from intent, how import blocks adopt hand-made objects and how moved blocks rename resources without touching them, then fix the pull request so its plan changes nothing real.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The web and admin buckets were two separate resources, the worker's log group had been made by hand during an incident, and someone had raised the api log retention from 30 to 90 days in the console. A tidy-up pull request merged the buckets into one for_each resource and added the worker log group. Its plan in CI was the most dangerous one the team had seen.",
    },

    content: [
        h2("Situation"),
        p("The plan CI posted on the pull request:"),
        code("text", `
Note: Objects have changed outside of Terraform
  # aws_cloudwatch_log_group.api has changed
  ~ retention_in_days = 30 -> 90

  # aws_cloudwatch_log_group.api will be updated in-place
  ~ retention_in_days = 90 -> 30
  # aws_cloudwatch_log_group.worker will be created
  # aws_s3_bucket.admin will be destroyed
  # aws_s3_bucket.web will be destroyed
  # aws_s3_bucket.site["admin"] will be created
  # aws_s3_bucket.site["web"] will be created

Plan: 3 to add, 1 to change, 2 to destroy.`, "terraform plan -var env=production"),
        bullets([
            "Both buckets would be destroyed and recreated empty: the refactor changed their addresses, and Terraform tracks objects by address.",
            "The worker log group exists in AWS but in no state, so Terraform planned to create it; AWS would have refused because the name is taken.",
            "The console change to 90 days was intended, yet the plan would quietly put 30 back.",
        ]),

        h2("The core you need"),
        bullets([
            "**Drift is reality changing behind Terraform's back.** Every plan refreshes first and reports \"Objects have changed outside of Terraform\", then plans whatever brings reality back to the configuration. `terraform plan -refresh-only` shows only the drift; `terraform apply -refresh-only` records it in state and changes nothing in AWS.",
            "**Decide, then write it down.** For each drifted value either adopt it (put `retention_in_days = 90` in the code) or let the next apply revert it. Leaving it is a decision too: the next unrelated apply makes it for you.",
            "**`import` blocks adopt existing objects.** `import { to = aws_cloudwatch_log_group.worker  id = \"/rice-rocket-production/worker\" }` plus a matching `resource` block makes the plan show `will be imported` instead of `will be created`. The id format is per resource type (a log group's is its name, an S3 bucket's its bucket name). Import blocks arrived in Terraform 1.5; recent versions accept expressions in `id`. `terraform plan -generate-config-out=generated.tf` drafts the resource block from the real object.",
            "**`moved` blocks rename without touching.** `moved { from = aws_s3_bucket.web  to = aws_s3_bucket.site[\"web\"] }` rewrites the address in state during the plan. It covers renames, count/for_each conversions and moves into or out of modules.",
            "**Keep moved and import blocks until every state has applied them.** Each environment (and each team using a shared module) has its own state; a block removed before staging applied it turns staging's plan back into destroy and create. A `removed` block (Terraform 1.7 and later) forgets an object without destroying it.",
        ]),

        h2("Apply it in the project"),
        code("hcl", `
locals {
  name  = "rice-rocket-\${var.env}"
  sites = toset(["web", "admin"])
}

resource "aws_s3_bucket" "site" {
  for_each = local.sites
  bucket   = "\${local.name}-\${each.key}"
}

moved {
  from = aws_s3_bucket.web
  to   = aws_s3_bucket.site["web"]
}

moved {
  from = aws_s3_bucket.admin
  to   = aws_s3_bucket.site["admin"]
}

import {
  to = aws_cloudwatch_log_group.worker
  id = "/\${local.name}/worker"
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/\${local.name}/worker"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/\${local.name}/api"
  retention_in_days = 90   # raised in the console on 2026-10-28, adopted here
}`, "infra/sites.tf"),
        callout("info", "Write the reason next to adopted drift",
            "A one-line comment with the date and the reason turns a console change into a reviewed decision. The next person who sees 90 days knows it was intended, and the pull request leaves a trail."),

        h2("Verify"),
        code("bash", `
terraform plan -refresh-only -var env=production   # see the drift alone first
terraform plan -var env=production
#   # aws_cloudwatch_log_group.worker will be imported
#   # aws_s3_bucket.web has moved to aws_s3_bucket.site["web"]
#   # aws_s3_bucket.admin has moved to aws_s3_bucket.site["admin"]
# Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
terraform plan -var env=staging                    # every environment, before merging
terraform state list | grep aws_s3_bucket          # after apply: only the site["..."] addresses`, "terminal"),
        p("A refactoring pull request is only ready when every environment's plan reads 0 to add, 0 to change and 0 to destroy (imports aside). Anything else is a real change hiding in a cleanup."),

        h2("Pitfalls"),
        bullets([
            "**A moved block with the wrong key.** `to = aws_s3_bucket.site[\"www\"]` points at an instance the configuration does not have, so the real web bucket still ends up planned for destroy. Read every `has moved to` line and check that no `will be destroyed` remains.",
            "**`-refresh-only` taken as \"fix the drift\".** It accepts reality into the state; it never changes AWS. Look for the follow-up normal plan that wants to revert the value.",
            "**Import ids in the wrong format.** Some types want a name, others an ARN or a composite id; a wrong one fails the plan with an error that the object cannot be found. Check the Import section at the bottom of the resource's provider documentation.",
        ]),

        challenge("chal_quiz_tf_151"),
        p("Now fix the pull request. The editor holds the corrected file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the pull request's mistakes on purpose. Run plans the file against production's recorded state, the real objects (with the console change) and the hand-made log group, then against staging and against the state after the apply."),
        challenge("chal_coding_tf_152"),
    ],
});
