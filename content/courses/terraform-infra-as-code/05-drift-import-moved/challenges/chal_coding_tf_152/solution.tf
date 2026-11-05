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

# @piece moved-web: Keep the existing web bucket under its new address
moved {
  from = aws_s3_bucket.web
  to   = aws_s3_bucket.site["web"]
}
# @end

# @piece moved-admin: Keep the existing admin bucket under its new address
moved {
  from = aws_s3_bucket.admin
  to   = aws_s3_bucket.site["admin"]
}
# @end

# @piece import-worker-logs: Adopt the worker log group created by hand
import {
  to = aws_cloudwatch_log_group.worker
  id = "/${local.name}/worker"
}
# @end

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/${local.name}/worker"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "api" {
  name = "/${local.name}/api"
  # @piece api-retention: api log retention, as the team decided in the console
  retention_in_days = 90
  # @end
}
