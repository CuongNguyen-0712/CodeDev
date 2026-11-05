# Refactoring pull request: the web and admin buckets become one for_each resource, the worker log
# group that was created by hand comes under Terraform, and the api log retention that someone
# raised in the console stays. The plan must create, replace and destroy nothing.
variable "env" {
  type = string
}

locals {
  name  = "rice-rocket-${var.env}"
  sites = toset(["web", "admin"])
}

resource "aws_s3_bucket" "site" {
  for_each = local.sites
  bucket   = "${local.name}-${each.key}"
}

# [ ] Keep the existing web bucket under its new address

# [ ] Keep the existing admin bucket under its new address

# [ ] Adopt the worker log group created by hand

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/${local.name}/worker"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "api" {
  name = "/${local.name}/api"
  # [ ] api log retention, as the team decided in the console
}
