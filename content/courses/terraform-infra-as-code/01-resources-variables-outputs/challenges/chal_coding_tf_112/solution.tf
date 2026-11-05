# Rice Rocket: the uploads bucket (receipts, courier photos) and the api log group, one copy per
# environment. Run with -var env=staging or -var env=production.
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

# @piece env-variable: The environment name, refused unless it is a known one
variable "env" {
  type        = string
  description = "Environment name: staging or production."
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env must be staging or production."
  }
}
# @end

# @piece name-and-tags: One name prefix and one tag set for every resource
locals {
  name = "rice-rocket-${var.env}"
  tags = {
    Project     = "rice-rocket"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}
# @end

# @piece uploads-bucket: The uploads bucket, named per environment
resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads"
  tags   = local.tags
}
# @end

# @piece uploads-versioning: Keep old versions of every uploaded object
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}
# @end

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# @piece api-log-group: api logs, kept longer in production
resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.name}/api"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = local.tags
}
# @end

# @piece outputs: What the api deployment needs to know
output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "uploads_bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}
# @end
