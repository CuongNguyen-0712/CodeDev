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

# [ ] The environment name, refused unless it is a known one

# [ ] One name prefix and one tag set for every resource

# [ ] The uploads bucket, named per environment

# [ ] Keep old versions of every uploaded object

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# [ ] api logs, kept longer in production

# [ ] What the api deployment needs to know
