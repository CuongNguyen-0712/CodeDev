# modules/static-site: one static site bucket (web, admin, ...) per call.
# The caller configures the aws provider and passes env, name, options and tags.
variable "env" {
  type        = string
  description = "Environment name: staging or production."
}

# @piece name-validation: The site name, refused unless S3 can use it
variable "name" {
  type        = string
  description = "Short site name, lowercase letters, digits and -, used in the bucket name."
  validation {
    condition     = length(var.name) > 0 && length(var.name) <= 20 && lower(var.name) == var.name && length(split(" ", var.name)) == 1
    error_message = "name must be 1-20 lowercase characters without spaces."
  }
}
# @end

# @piece site-options: Typed options, each with a safe default
variable "options" {
  description = "Site options. Anything not set keeps the safe default."
  type = object({
    versioning          = optional(bool, true)
    block_public_access = optional(bool, true)
  })
  default = {}
}
# @end

variable "tags" {
  type    = map(string)
  default = {}
}

# @piece bucket: The site bucket, named from env and site name
resource "aws_s3_bucket" "this" {
  bucket = "rice-rocket-${var.env}-${var.name}"
  tags   = merge(var.tags, { Site = var.name })
}
# @end

# @piece public-access-block: Public access blocked unless a caller opts out
resource "aws_s3_bucket_public_access_block" "this" {
  count                   = var.options.block_public_access ? 1 : 0
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
# @end

# @piece versioning: Versioning when the options ask for it
resource "aws_s3_bucket_versioning" "this" {
  count  = var.options.versioning ? 1 : 0
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}
# @end

# @piece outputs: What callers may use: the bucket name and ARN
output "bucket" {
  value = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}
# @end
